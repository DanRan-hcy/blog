---
title: Hyperf 协程开发踩坑实录
date: 2026-01-19
sticky: 2
readingTime: true
tags:
  - PHP
  - Hyperf
  - 协程
  - Swoole
category:
  - 开发日常
description: 记录在 Hyperf 协程开发中遇到的各种坑，包括上下文丢失、连接池泄漏、并发安全等问题，以及对应的解决方案和最佳实践
---

# Hyperf 协程开发踩坑实录

用 Hyperf 开发也有一段时间了，从最开始对协程的懵懂，到现在能比较熟练地使用，中间踩了不少坑。今天整理一下这些问题，希望能帮到同样在用 Hyperf 的朋友。

## 第一个坑：协程上下文丢失

这个问题是我最早遇到的，当时排查了整整一个下午。

### 问题场景

我们有个需求，需要在日志中记录用户的请求 ID，方便追踪问题。代码大概是这样的：

```php
// 中间件中设置请求 ID
class RequestIdMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $requestId = $request->getHeaderLine('X-Request-Id') ?: uniqid('req_');
        Context::set('request_id', $requestId);
        
        return $handler->handle($request);
    }
}

// 在 Service 中使用
class UserService
{
    public function getUserInfo(int $userId): array
    {
        $requestId = Context::get('request_id');
        Log::info("查询用户信息", ['request_id' => $requestId, 'user_id' => $userId]);
        
        // 这里有个异步操作
        $result = $this->asyncGetUserData($userId);
        
        return $result;
    }
    
    private function asyncGetUserData(int $userId): array
    {
        // 问题就出在这里
        return parallel([
            'profile' => function () use ($userId) {
                $requestId = Context::get('request_id'); // 这里拿到的是 null！
                Log::info("查询用户资料", ['request_id' => $requestId]);
                return $this->userRepo->getProfile($userId);
            },
            'orders' => function () use ($userId) {
                return $this->orderRepo->getUserOrders($userId);
            }
        ]);
    }
}
```

### 问题原因

`parallel()` 函数会创建新的协程，而 Hyperf 的 Context 是协程隔离的。新协程无法访问父协程的上下文数据。

这个设计其实是合理的，因为协程之间应该是独立的，但在实际开发中确实容易踩坑。

### 解决方案

方案一：手动传递上下文

```php
private function asyncGetUserData(int $userId): array
{
    $requestId = Context::get('request_id'); // 在父协程中获取
    
    return parallel([
        'profile' => function () use ($userId, $requestId) {
            Context::set('request_id', $requestId); // 在子协程中设置
            Log::info("查询用户资料", ['request_id' => $requestId]);
            return $this->userRepo->getProfile($userId);
        },
        'orders' => function () use ($userId, $requestId) {
            Context::set('request_id', $requestId);
            return $this->orderRepo->getUserOrders($userId);
        }
    ]);
}
```

方案二：使用 Context::copy()（推荐）

```php
private function asyncGetUserData(int $userId): array
{
    return parallel([
        'profile' => function () use ($userId) {
            Context::copy(Coroutine::parentId()); // 复制父协程的上下文
            Log::info("查询用户资料", ['request_id' => Context::get('request_id')]);
            return $this->userRepo->getProfile($userId);
        },
        'orders' => function () use ($userId) {
            Context::copy(Coroutine::parentId());
            return $this->orderRepo->getUserOrders($userId);
        }
    ]);
}
```

但这样每个闭包都要写一遍，还是挺烦的。所以我封装了一个工具方法：

```php
class CoroutineHelper
{
    /**
     * 并行执行任务，自动复制上下文
     */
    public static function parallelWithContext(array $tasks): array
    {
        $wrappedTasks = [];
        foreach ($tasks as $key => $task) {
            $wrappedTasks[$key] = function () use ($task) {
                Context::copy(Coroutine::parentId());
                return $task();
            };
        }
        
        return parallel($wrappedTasks);
    }
}

// 使用起来就简洁多了
private function asyncGetUserData(int $userId): array
{
    return CoroutineHelper::parallelWithContext([
        'profile' => fn() => $this->userRepo->getProfile($userId),
        'orders' => fn() => $this->orderRepo->getUserOrders($userId),
    ]);
}
```

## 第二个坑：数据库连接池耗尽

这个问题更隐蔽，线上突然出现大量请求超时，排查了半天才发现是连接池的问题。

### 问题场景

我们有个批量处理的接口，需要并发查询多个用户的数据：

```php
public function batchGetUsers(array $userIds): array
{
    $results = [];
    
    // 用协程并发查询，提高性能
    foreach ($userIds as $userId) {
        go(function () use ($userId, &$results) {
            $user = $this->userRepo->find($userId);
            $results[$userId] = $user;
        });
    }
    
    // 等待所有协程完成
    Coroutine::sleep(1);
    
    return $results;
}
```

当 `$userIds` 数量比较少的时候没问题，但当一次传入几百个 ID 时，就会出现大量超时。

### 问题原因

Hyperf 的数据库连接池默认配置是：

```php
'pool' => [
    'min_connections' => 1,
    'max_connections' => 10,
    'connect_timeout' => 10.0,
    'wait_timeout' => 3.0,
]
```

我一次创建了几百个协程，但连接池只有 10 个连接。当所有连接都被占用时，新的协程会等待 `wait_timeout`（3秒），然后抛出异常。

更糟糕的是，如果某个查询比较慢，会一直占用连接，导致其他协程都在等待。

### 解决方案

方案一：限制并发数量（推荐）

```php
public function batchGetUsers(array $userIds): array
{
    $results = [];
    $channel = new Channel(count($userIds));
    
    // 使用协程池，限制并发数量
    $pool = new \Swoole\Coroutine\Pool(8); // 最多 8 个并发
    
    foreach ($userIds as $userId) {
        $pool->submit(function () use ($userId, $channel) {
            try {
                $user = $this->userRepo->find($userId);
                $channel->push(['id' => $userId, 'data' => $user]);
            } catch (\Throwable $e) {
                Log::error("查询用户失败", ['user_id' => $userId, 'error' => $e->getMessage()]);
                $channel->push(['id' => $userId, 'data' => null]);
            }
        });
    }
    
    // 收集结果
    for ($i = 0; $i < count($userIds); $i++) {
        $result = $channel->pop();
        $results[$result['id']] = $result['data'];
    }
    
    return $results;
}
```

不过 Swoole 的 Pool 在 Hyperf 中用起来不太方便，我更喜欢用 Hyperf 自带的 `concurrent()` 函数：

```php
public function batchGetUsers(array $userIds): array
{
    // 分批处理，每批 8 个
    $chunks = array_chunk($userIds, 8);
    $results = [];
    
    foreach ($chunks as $chunk) {
        $batchResults = parallel(array_map(function ($userId) {
            return fn() => $this->userRepo->find($userId);
        }, $chunk));
        
        $results = array_merge($results, $batchResults);
    }
    
    return $results;
}
```

方案二：调整连接池配置

如果确实需要高并发，可以增加连接池大小：

```php
'pool' => [
    'min_connections' => 5,
    'max_connections' => 50, // 增加最大连接数
    'connect_timeout' => 10.0,
    'wait_timeout' => 5.0,   // 增加等待时间
]
```

但要注意，连接数不是越大越好。MySQL 默认最大连接数是 151，如果多个服务共用一个数据库，很容易超限。

### 经验总结

1. **永远不要无限制地创建协程**，特别是涉及 IO 操作时
2. **使用连接池时要考虑并发数**，一般设置为连接池大小的 80% 比较安全
3. **加上超时和异常处理**，避免一个慢查询拖垮整个服务

## 第三个坑：协程间的数据竞争

这个问题比较隐蔽，不容易复现，但一旦出现就很难排查。

### 问题场景

我们有个计数器功能，统计某个操作的执行次数：

```php
class StatService
{
    private array $counters = [];
    
    public function increment(string $key): void
    {
        if (!isset($this->counters[$key])) {
            $this->counters[$key] = 0;
        }
        
        $this->counters[$key]++; // 问题在这里
    }
    
    public function getCount(string $key): int
    {
        return $this->counters[$key] ?? 0;
    }
}
```

在单元测试中，我并发执行 1000 次 `increment()`，期望结果是 1000，但实际结果总是小于 1000，而且每次都不一样。

### 问题原因

PHP 的 `++` 操作不是原子的，它实际上是三个步骤：

1. 读取当前值
2. 加 1
3. 写回

在协程并发的情况下，可能出现这种情况：

```
协程 A: 读取 counter = 5
协程 B: 读取 counter = 5
协程 A: 计算 5 + 1 = 6
协程 B: 计算 5 + 1 = 6
协程 A: 写入 counter = 6
协程 B: 写入 counter = 6  // 覆盖了 A 的结果
```

结果就是两次操作只增加了 1。

### 解决方案

方案一：使用 Channel 串行化操作

```php
class StatService
{
    private array $counters = [];
    private Channel $channel;
    
    public function __construct()
    {
        $this->channel = new Channel(1);
        $this->channel->push(true); // 初始化信号量
    }
    
    public function increment(string $key): void
    {
        $this->channel->pop(); // 获取锁
        
        try {
            if (!isset($this->counters[$key])) {
                $this->counters[$key] = 0;
            }
            $this->counters[$key]++;
        } finally {
            $this->channel->push(true); // 释放锁
        }
    }
}
```

方案二：使用 Redis 原子操作（推荐）

```php
class StatService
{
    public function __construct(
        private Redis $redis
    ) {}
    
    public function increment(string $key): void
    {
        $this->redis->incr("stat:{$key}");
    }
    
    public function getCount(string $key): int
    {
        return (int) $this->redis->get("stat:{$key}");
    }
}
```

Redis 的 `INCR` 命令是原子操作，天然支持并发。

方案三：使用 Swoole Table（适合高频操作）

```php
class StatService
{
    private \Swoole\Table $table;
    
    public function __construct()
    {
        $this->table = new \Swoole\Table(1024);
        $this->table->column('count', \Swoole\Table::TYPE_INT);
        $this->table->create();
    }
    
    public function increment(string $key): void
    {
        // Swoole Table 的操作是原子的
        $count = $this->table->get($key, 'count') ?: 0;
        $this->table->set($key, ['count' => $count + 1]);
    }
}
```

### 经验总结

1. **协程不是线程，但同样存在并发安全问题**
2. **不要在协程间共享可变状态**，如果必须共享，使用锁或原子操作
3. **优先使用 Redis 等外部存储**，它们已经处理好了并发问题

## 第四个坑：defer 的执行时机

这个坑让我在生产环境出了一次事故，印象深刻。

### 问题场景

我们需要记录接口的执行时间：

```php
public function handleRequest(): Response
{
    $startTime = microtime(true);
    
    defer(function () use ($startTime) {
        $duration = microtime(true) - $startTime;
        Log::info("接口执行时间", ['duration' => $duration]);
    });
    
    // 业务逻辑
    $result = $this->service->process();
    
    return new JsonResponse($result);
}
```

看起来没问题，但实际上日志记录的时间总是比实际时间短很多。

### 问题原因

`defer()` 是在协程结束时执行的，而不是函数返回时。在 Hyperf 中，一个请求对应一个协程，这个协程会在响应发送给客户端后才结束。

但问题是，如果在 `defer()` 中访问了协程上下文的数据（比如数据库连接），可能会出现问题，因为此时请求已经结束，上下文可能已经被清理了。

更严重的是，如果 `defer()` 中有耗时操作，会阻塞协程的回收，影响性能。

### 解决方案

方案一：在函数末尾手动记录

```php
public function handleRequest(): Response
{
    $startTime = microtime(true);
    
    try {
        $result = $this->service->process();
        return new JsonResponse($result);
    } finally {
        $duration = microtime(true) - $startTime;
        Log::info("接口执行时间", ['duration' => $duration]);
    }
}
```

方案二：使用中间件

```php
class TimingMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $startTime = microtime(true);
        
        $response = $handler->handle($request);
        
        $duration = microtime(true) - $startTime;
        Log::info("接口执行时间", [
            'uri' => $request->getUri()->getPath(),
            'duration' => $duration
        ]);
        
        return $response;
    }
}
```

### 经验总结

1. **defer() 适合做资源清理，不适合做业务逻辑**
2. **如果需要在函数结束时执行代码，用 try-finally 更可控**
3. **中间件是处理横切关注点的最佳位置**

## 第五个坑：协程泄漏

这个问题最难发现，因为它不会立即导致错误，而是慢慢地消耗内存，最终导致服务崩溃。

### 问题场景

我们有个消息推送功能，需要持续监听 Redis 队列：

```php
public function startConsumer(): void
{
    go(function () {
        while (true) {
            try {
                $message = $this->redis->blPop(['message_queue'], 5);
                if ($message) {
                    $this->handleMessage($message[1]);
                }
            } catch (\Throwable $e) {
                Log::error("消费消息失败", ['error' => $e->getMessage()]);
                // 出错后继续循环
            }
        }
    });
}
```

这段代码看起来没问题，但运行一段时间后，内存占用越来越高，最后 OOM。

### 问题原因

每次调用 `startConsumer()` 都会创建一个新的协程，而这个协程永远不会结束（死循环）。如果在服务重启或重新加载配置时多次调用这个方法，就会创建多个协程，导致协程泄漏。

另外，即使只创建一次，如果 `handleMessage()` 中有内存泄漏（比如闭包引用了大对象），也会导致内存持续增长。

### 解决方案

方案一：使用进程管理

```php
#[Process(name: "message-consumer")]
class MessageConsumerProcess extends AbstractProcess
{
    public function handle(): void
    {
        while (true) {
            try {
                $message = $this->redis->blPop(['message_queue'], 5);
                if ($message) {
                    $this->handleMessage($message[1]);
                }
            } catch (\Throwable $e) {
                Log::error("消费消息失败", ['error' => $e->getMessage()]);
                sleep(1); // 出错后等待一下
            }
        }
    }
}
```

使用 Hyperf 的 Process 组件，框架会自动管理进程的生命周期。

方案二：添加协程管理

```php
class MessageConsumer
{
    private ?int $coroutineId = null;
    
    public function start(): void
    {
        if ($this->coroutineId !== null && Coroutine::exists($this->coroutineId)) {
            throw new \RuntimeException("消费者已经在运行");
        }
        
        $this->coroutineId = go(function () {
            while (true) {
                // ... 消费逻辑
            }
        });
    }
    
    public function stop(): void
    {
        if ($this->coroutineId !== null) {
            Coroutine::cancel($this->coroutineId);
            $this->coroutineId = null;
        }
    }
}
```

### 经验总结

1. **长期运行的协程要有明确的生命周期管理**
2. **使用 Process 组件管理后台任务**
3. **定期检查协程数量**，可以用 `Coroutine::stats()` 查看

## 一些最佳实践

经过这些踩坑经历，我总结了一些使用协程的最佳实践：

### 1. 合理使用并发

不是所有地方都适合用协程并发：

```php
// 不好的做法：为了并发而并发
public function getUser(int $userId): array
{
    return parallel([
        'user' => fn() => $this->userRepo->find($userId),
        'profile' => fn() => $this->profileRepo->find($userId),
    ]);
}

// 好的做法：只在有明显收益时使用
public function getUserWithOrders(int $userId): array
{
    // 这两个查询互不依赖，且都比较耗时，适合并发
    return parallel([
        'user' => fn() => $this->userRepo->find($userId),
        'orders' => fn() => $this->orderRepo->getUserOrders($userId, limit: 100),
    ]);
}
```

### 2. 设置合理的超时

所有 IO 操作都应该设置超时：

```php
// 数据库查询超时
'pool' => [
    'max_connections' => 10,
    'wait_timeout' => 3.0,
],

// HTTP 请求超时
$client = $this->clientFactory->create([
    'timeout' => 5.0,
]);

// Redis 操作超时
$this->redis->setOption(\Redis::OPT_READ_TIMEOUT, 3);
```

### 3. 做好异常处理

协程中的异常不会自动传播，要主动捕获：

```php
public function batchProcess(array $items): array
{
    $results = [];
    $errors = [];
    
    $tasks = array_map(function ($item) use (&$errors) {
        return function () use ($item, &$errors) {
            try {
                return $this->process($item);
            } catch (\Throwable $e) {
                $errors[] = [
                    'item' => $item,
                    'error' => $e->getMessage(),
                ];
                return null;
            }
        };
    }, $items);
    
    $results = parallel($tasks);
    
    if (!empty($errors)) {
        Log::warning("批量处理部分失败", ['errors' => $errors]);
    }
    
    return array_filter($results);
}
```

### 4. 监控协程状态

在开发环境可以加个中间件，监控协程使用情况：

```php
class CoroutineMonitorMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $statsBefore = Coroutine::stats();
        
        $response = $handler->handle($request);
        
        $statsAfter = Coroutine::stats();
        
        if ($statsAfter['coroutine_num'] - $statsBefore['coroutine_num'] > 100) {
            Log::warning("协程数量异常增长", [
                'before' => $statsBefore['coroutine_num'],
                'after' => $statsAfter['coroutine_num'],
                'uri' => $request->getUri()->getPath(),
            ]);
        }
        
        return $response;
    }
}
```

## 写在最后

协程是 Hyperf 的核心特性，用好了能大幅提升性能，但也确实有不少坑。这些问题大多数都是我在实际项目中遇到的，有些还导致了线上事故。

希望这篇文章能帮你少踩一些坑。如果你也遇到过其他协程相关的问题，欢迎在评论区分享。

最后提醒一句：**协程虽好，可不要贪杯哦**。不是所有场景都适合用协程，有时候简单的同步代码反而更可靠。

## 参考资料

- [Hyperf 官方文档 - 协程](https://hyperf.wiki/3.1/#/zh-cn/coroutine)
- [Swoole 文档 - 协程](https://wiki.swoole.com/#/coroutine)
- [PHP 协程：从原理到实践](https://segmentfault.com/a/1190000018889185)
