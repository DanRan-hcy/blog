---
title: ThinkPHP5.0 适配达梦8
date: 2024-04-09
sticky: 2
publish: true
readingTime: true
tags:
  - PHP
  - THINKPHP5.0
  - Dm8
  - 达梦
category:
  - 开发日常
---

# ThinkPHP5.0 适配达梦8

## 问题背景
最近项目遇到了国产化的问题，查询过一些网上资料后，分享一下信创适配过程和遇到的一些坑

## 项目环境
- PHP 7.3
- ThinkPHP 5.0.x
- Mysql 5.7
- Dm8 

## 适配过程
 ### 1. 创建 `/thinkphp/library/think/db/builder/Dm.php` 文件
 ```php
<?php

namespace think\db\builder;

use think\db\Builder;
use think\db\Expression;
use think\db\Query;

/**
 * 达梦数据库驱动
 */
class Dm extends Builder
{
    /**
     * 字段和表名处理
     * @access protected
     * @param mixed  $key
     * @param array  $options
     * @return string
     */
    protected function parseKey($key, $options = [], $strict = false)
    {
        if (is_numeric($key)) {
            return $key;
        } elseif ($key instanceof Expression) {
            return $key->getValue();
        }
        $key = trim($key);

        if (strpos($key, '.')) {
            list($table, $key) = explode('.', $key, 2);

            $alias = $this->query->getOptions('alias');

            if ('__TABLE__' == $table) {
                $table = $this->query->getOptions('table');
                $table = is_array($table) ? array_shift($table) : $table;
            }

            if (isset($alias[$table])) {
                $table = $alias[$table];
            }
        }

        $key = str_replace('`', '', $key);
        if ('*' != $key && !preg_match('/[,\'\"\*\(\).\s]/', $key)) {
            $key = '"' . $key . '"';
        }

        if (isset($table)) {
            $key = $table . '.' . $key;
        }
        return $key;
    }

    /**
     * 随机排序
     * @access protected
     * @param  Query     $query        查询对象
     * @return string
     */
    protected function parseRand(Query $query)
    {
        return 'RAND()';
    }
}

 ```
 ### 2. 创建 `thinkphp/library/think/db/connector/Dm.php` 文件

```php
<?php
namespace think\db\connector;

use PDO;
use think\db\BaseQuery;
use think\db\Connection;

/**
 * Dm数据库驱动
 */
class Dm extends Connection
{
    
    /**
     * 解析pdo连接的dsn信息
     * @access protected
     * @param array $config 连接信息
     * @return string
     */
    protected function parseDsn($config)
    {
        $dsn = 'dm:host=' . $config['hostname'];

        if (!empty($config['hostport'])) {
            $dsn .= ':' . $config['hostport'];
        }
        return $dsn;
    }

     /**
     * 取得数据表的字段信息
     * @access public
     * @param string $tableName
     * @return array
     */
    public function getFields($tableName)
    {
        $config = $this->getConfig();
        $tableName = str_replace($config['database'].'.', '', $tableName);
        $sql = "select * from all_tab_columns where table_name='{$tableName}'";
        $pdo = $this->query($sql, [], false, true);
        $result = $pdo->fetchAll(PDO::FETCH_ASSOC);
        $info = [];

        if ($result) {
            foreach ($result as $key => $val) {
                $val = array_change_key_case($val);
                $info[$val['column_name']] = [
                    'name' => $val['column_name'],
                    'type' => $val['data_type'],
                    'notnull' => 'Y' === $val['nullable'],
                    'default' => $val['data_default'],
                    'primary' => $val['column_name'] === 'id',
                    'autoinc' => false,
                ];
            }
        }

        return $this->fieldCase($info);
    }

    /**
     * 取得数据库的表信息
     * @access   public
     * @param string $dbName
     * @return array
     */
    public function getTables($dbName = '')
    {
        $config = $this->getConfig();
        $sql = "select table_name from all_tables where OWNER='{$config['username']}'";
        $pdo = $this->getPDOStatement($sql);
        $result = $pdo->fetchAll(PDO::FETCH_ASSOC);
        $info = [];

        foreach ($result as $key => $val) {
            $info[$key] = current($val);
        }

        return $info;
    }

    /**
     * SQL性能分析
     * @access protected
     * @param string $sql
     * @return array
     */
    protected function getExplain($sql)
    {
        return [];
    }

    protected function supportSavepoint()
    {
        return true;
    }
}
```
### 3. 配置文件中修改数据库配置( `application/database.php`)

```php
     'type'            => 'dm',
    // 服务器地址
    'hostname'        => '127.0.0.1',
    // 数据库名
    'database'        => 'database', //替换成自己的
    // 用户名
    'username'        => 'SYSDBA',
    // 密码
    'password'        => 'xxx',
    // 端口
    'hostport'        => '3306',
    // 连接dsn
    'dsn'             => '',
    // 数据库连接参数
    'params'          => [],
    // 数据库编码默认采用utf8
    'charset'         => 'utf8',
    // 数据库表前缀
    'prefix'          => 'database.prefix_', //替换成自己的

```
至此，就完成了数据库代码适配；

## 遇到的问题
### 1. 报错`can not find driver`
这是因为没有安装pdo_dm扩展，安装后重启即可
直接按照这个文章来，一次成功
 [麒麟V10安装宝塔部署PHP环境并连接达梦数据库](http://www.884358.com/kylin-bt-php/#php_an_zhuang_da_meng_kuo_zhan)
### 2. 数据表字段不存在:[xxx]
报错某个字段不存在。一开始gpt告诉我是因为字段名大小写问题，在gpt指导下各种尝试还是报错，最后发现原来是 `thinkphp/library/think/db/connector/Dm.php`中`getFields`方法写的有问题。
```php
$tableName = str_replace($config['database'].'.', '', $tableName); // 加上这个，去掉数据库名就可以了
```
### 3. xxx表不存在
这里不知道原因，但是`application/database.php`中`prefix`字段配置上数据库名就可以了
```php
'prefix'  => 'database.prefix_', //替换成自己的
```

## 总结
第一次做国产化适配遇到了这些坑和问题，国产化真的是一件很麻烦的事情，但是也很有趣，希望大家都能顺利完成国产化的适配。
还有，这数据库是真卡。

## 参考资料
- [麒麟V10安装宝塔部署PHP环境并连接达梦数据库](http://www.884358.com/kylin-bt-php/#php_an_zhuang_da_meng_kuo_zhan)
- [ThinkPHP 达梦8数据库驱动](https://gitee.com/xiaocheng_keji/think-dm)
- [达梦技术文档](https://eco.DAMENG.com/document/dm/zh-cn/start/dm-version-differences.html)

