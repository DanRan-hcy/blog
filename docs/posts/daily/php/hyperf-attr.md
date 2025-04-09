---
title: Hyperf 模型修改器与类型转换的冲突问题
date: 2024-03-19
sticky: 1
readingTime: true
tags:
  - PHP
  - Hyperf
  - ORM
category:
  - 开发日常
---

# Hyperf 模型修改器与类型转换的冲突问题

## 问题背景

在使用 Hyperf ORM 开发时，遇到一个关于模型修改器（Mutator）和类型转换（Type Casting）的有趣问题。我需要将数据库中的逗号分隔字符串转换为数组来使用，同时在保存时将数组转回字符串。

## 问题代码

```php
declare(strict_types=1);

namespace App\Pet\Model;

use Hyperf\Database\Model\SoftDeletes;
use Mine\MineModel;

class PetHospitals extends MineModel
{
    use SoftDeletes;

    protected string $primaryKey = 'hos_id';
    protected ?string $table = 'hospitals';
    protected array $fillable = ['hos_first_tag', 'hos_two_tag'];
    
    // 问题所在：同时使用了类型转换和修改器
    protected array $casts = ['hos_first_tag' =>'array', 'hos_two_tag'=>'array'];
    
    public function getHosFirstTagAttribute($value): array
    {
        if (is_array($value)) {
            return $value;
        }
        return $value ? explode(',', (string)$value) : [];
    }

    public function setHosFirstTagAttribute($value)
    {
        if (is_array($value)) {
            $this->attributes['hos_first_tag'] = implode(',', $value);
        } else {
            $this->attributes['hos_first_tag'] = $value;
        }
    }

    public function getHosTwoTagAttribute($value): array
    {
        if (is_array($value)) {
            return $value;
        }
        return $value ? explode(',', (string)$value) : [];
    }

    public function setHosTwoTagAttribute($value)
    {
        if (is_array($value)) {
            $this->attributes['hos_two_tag'] = implode(',', $value);
        } else {
            $this->attributes['hos_two_tag'] = $value;
        }
    }

}
```
## 问题描述
在更新数据时，发现修改器不起作用，update 语句中没有包含这两个字段的更新。经过排查，发现是由于同时使用了类型转换（Type Casting）和修改器（Mutator）导致的冲突。

## 原因分析
查阅 Hyperf 官方文档后发现：

当你在数据库存储序列化的 JSON 的数据时，array 类型的转换非常有用。如果你的数据库具有被序列化为 JSON 的 JSON 或 TEXT 字段类型，并且在模型中加入了 array 类型转换，那么当你访问的时候就会自动被转换为 PHP 数组。

在这种情况下，类型转换会优先于修改器执行，导致修改器的逻辑被跳过。

## 解决方案
有两种解决方案：

1. 移除类型转换，仅使用修改器：
```php
protected array $casts = []; // 移除类型转换
```
2. 移除修改器，仅使用类型转换（如果数据库字段是 JSON 类型）：
```php
protected array $casts = ['hos_first_tag' =>'array', 'hos_two_tag'=>'array']; 
```
### 最佳实践
1. 明确数据类型 ：

    - 如果数据库字段是 JSON 类型，优先使用类型转换
    - 如果是字符串类型需要特殊处理，使用修改器
2. 避免重复转换 ：

    - 不要同时使用类型转换和修改器处理同一个字段
    - 选择最适合业务场景的一种方式
3. 代码可维护性 ：

    - 在注释中说明字段的数据格式
    - 保持转换逻辑的一致性

### 总结
在 Hyperf 框架中，模型的类型转换和修改器都是强大的功能，但需要注意它们之间可能的冲突。理解它们的工作机制和优先级，可以帮助我们更好地处理数据转换的需求。

### 参考资料
- [Hyperf 文档 - 类型转换](https://hyperf.wiki/3.1/#/zh-cn/db/mutators?id=%e6%95%b0%e7%bb%84-amp-json-%e8%bd%ac%e6%8d%a2)