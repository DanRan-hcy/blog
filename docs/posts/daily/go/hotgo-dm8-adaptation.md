---
title: HotGo 适配达梦数据库实战：从 MySQL 到国产化的迁移之路
date: 2025-01-21
sticky: 3
readingTime: true
tags:
  - Go
  - GoFrame
  - HotGo
  - 达梦数据库
  - dm
  - 国产化
category:
  - 开发日常
description: 记录 HotGo 后台管理系统从 MySQL 迁移到达梦数据库的完整过程，包括驱动适配、SQL 兼容性处理、数据迁移等实战经验
---

# HotGo 适配达梦数据库实战：从 MySQL 到国产化的迁移之路

最近接到一个国产化改造的需求，要把公司的后台管理系统从 MySQL 迁移到达梦数据库。我们用的是 [HotGo](https://github.com/bufanyun/hotgo) 框架（基于 GoFrame），本以为只是换个数据库驱动的事，结果发现坑还真不少。这篇文章记录一下整个适配过程，希望能帮到同样在做国产化改造的朋友。

## 背景介绍

### 为什么要适配达梦？

国产化改造是大势所趋，特别是政府和国企项目，基本都要求使用国产数据库。达梦（DM8）是国内比较成熟的商业数据库，兼容性相对较好，所以成了我们的首选。

### 关于 HotGo

HotGo 是一个基于 GoFrame2 + Vue3 + NaiveUI 开发的全栈框架，专为二次开发而生。它的特点是：

- **高生产率**：模块化、插件化机制，几分钟就能搭建开发骨架
- **多应用入口**：Admin（后台）、Home（前台）、Api（接口）、WebSocket（即时通讯）
- **代码生成**：无需编写代码，配置表结构就能生成完整的 CURD
- **插件化架构**：微核架构，功能隔离，支持插件热插拔

goframe官方已经提供了达梦适配版本，但在实际使用中还是遇到了一些问题，这里记录一下完整的适配过程。

### 技术栈

**后端：**
- **框架**: HotGo V2（基于 GoFrame 2.9.4）
- **原数据库**: MySQL 8.0
- **目标数据库**: 达梦 DM8（V8.1.2.128）
- **Go 版本**: 1.21+

**前端：**
- **框架**: Vue 3.4
- **UI 库**: Naive UI 2.43.1+
- **构建工具**: Vite 5.4.2+
- **语言**: TypeScript 4.0+

### 预期工作量

一开始我以为一两天就能搞定，结果前前后后花了快一周。主要时间花在：
- SQL 语法差异处理（30%）
- 数据类型兼容（20%）
- 驱动适配和调试（30%）
- 数据迁移和验证（20%）


## 驱动适配

### GoFrame 的数据库驱动机制

GoFrame 的数据库驱动是通过 `gdb.Register()` 注册的，只要实现了 `database/sql/driver` 接口就能使用。

### 达梦驱动选型

达梦官方提供了 Go 语言的驱动包，HotGo V2 DM 版本已经集成了达梦驱动：

```go
// 在 go.mod 中可以看到
require (
    github.com/gogf/gf/contrib/drivers/dm/v2 v2.9.8 // 和下一行的二选一
    gitee.com/chunanyong/dm v1.8.11 // 达梦数据库驱动
    github.com/gogf/gf/v2 v2.9.4
    // ... 其他依赖
)
```

这个驱动是达梦官方维护的，兼容性和稳定性都比较好。

### 驱动集成

在 HotGo 中，在 `main.go` 中：

```go
package main

import (
    _ "github.com/gogf/gf/contrib/drivers/dm/v2"
    _ "github.com/gogf/gf/contrib/drivers/mysql/v2" // MySQL 驱动（可选保留）
)

```

如果你是从 MySQL 版本迁移过来的，只需要添加达梦驱动的导入即可，两个驱动可以共存。

## 第三步：配置文件修改

### HotGo 的数据库配置

HotGo 的数据库[配置](https://goframe.org/docs/core/gdb-config-file#%E7%AE%80%E5%8D%95%E9%85%8D%E7%BD%AE)在 `manifest/config/config.yaml`：


**修改后的达梦配置：**
```yaml
database:
  logger:
    path: "./storage/logs/sql"
    <<: *defaultLogger
    stdout: true
  default:
    link: "dm:SYSDBA:Dm123456@tcp(127.0.0.1:5236)/HOTGO"
    debug: true
    Prefix: "hg_"
    type: "dm"
```


### 注意事项

1. **端口号**：达梦默认端口是 5236，不是 MySQL 的 3306
2. **字符集**：达梦推荐使用 utf8，而不是 utf8mb4
3. **type**: type 要加上，这样才能识别出是`dm`数据库


## HotGo 代码适配

### `internal/consts/debris.go`
```go

const (
	DBMysql = "mysql"
	DBPgsql = "pgsql"
	DBDm    = "dm" // 添加达梦
)

```

### `internal/library/casbin/adapter.go` 适配casbin
```go
// Package casbin
// @Link  https://github.com/bufanyun/hotgo
// @Copyright  Copyright (c) 2023 HotGo CLI
// @Author  Ms <133814250@qq.com>
// @License  https://github.com/bufanyun/hotgo/blob/master/LICENSE
package casbin

import (
	"context"
	"errors"
	"fmt"
	"hotgo/internal/consts"
	"hotgo/internal/dao"
	"math"
	"strings"

	"github.com/casbin/casbin/v2/model"
	"github.com/casbin/casbin/v2/persist"
	"github.com/gogf/gf/v2/database/gdb"
)

var defaultTableName = dao.AdminRoleCasbin.Table()

const (
	dropPolicyTableSql   = `DROP TABLE IF EXISTS %s`
	createPolicyTableSql = `
CREATE TABLE IF NOT EXISTS %s (
  id bigint(20) NOT NULL AUTO_INCREMENT,
  p_type varchar(64) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  v0 varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  v1 varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  v2 varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  v3 varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  v4 varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  v5 varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  PRIMARY KEY (id) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8 COLLATE = utf8_general_ci COMMENT = '管理员_casbin权限表' ROW_FORMAT = Dynamic;
`
	createPolicyTablePgSql = `CREATE TABLE IF NOT EXISTS "public"."%s" (
  "id" int8 NOT NULL DEFAULT nextval('hg_admin_role_casbin_id_seq'::regclass),
  "p_type" varchar(64) COLLATE "pg_catalog"."default",
  "v0" varchar(256) COLLATE "pg_catalog"."default",
  "v1" varchar(256) COLLATE "pg_catalog"."default",
  "v2" varchar(256) COLLATE "pg_catalog"."default",
  "v3" varchar(256) COLLATE "pg_catalog"."default",
  "v4" varchar(256) COLLATE "pg_catalog"."default",
  "v5" varchar(256) COLLATE "pg_catalog"."default",
  CONSTRAINT "hg_admin_role_casbin_pkey" PRIMARY KEY ("id")
)
;

ALTER TABLE "public"."%s" 
  OWNER TO "postgres";

COMMENT ON TABLE "public"."%s" IS '管理员_casbin权限表';`

	createPolicyTableDmSql = `
CREATE TABLE IF NOT EXISTS "%s" (
  "id" BIGINT NOT NULL IDENTITY(1,1),
  "p_type" VARCHAR(64),
  "v0" VARCHAR(256),
  "v1" VARCHAR(256),
  "v2" VARCHAR(256),
  "v3" VARCHAR(256),
  "v4" VARCHAR(256),
  "v5" VARCHAR(256),
  PRIMARY KEY ("id")
)`
)

type (
	adapter struct {
		db    gdb.DB
		table string
	}

	policyColumns struct {
		ID    string // ID
		PType string // PType
		V0    string // V0
		V1    string // V1
		V2    string // V2
		V3    string // V3
		V4    string // V4
		V5    string // V5
	}

	// policy rule entity
	policyRule struct {
		ID    int64  `orm:"id" json:"id"`
		PType string `orm:"p_type" json:"p_type"`
		V0    string `orm:"v0" json:"v0"`
		V1    string `orm:"v1" json:"v1"`
		V2    string `orm:"v2" json:"v2"`
		V3    string `orm:"v3" json:"v3"`
		V4    string `orm:"v4" json:"v4"`
		V5    string `orm:"v5" json:"v5"`
	}
)

var (
	errInvalidDatabaseLink = errors.New("invalid database link")
	policyColumnsName      = policyColumns{
		ID:    "id",
		PType: "p_type",
		V0:    "v0",
		V1:    "v1",
		V2:    "v2",
		V3:    "v3",
		V4:    "v4",
		V5:    "v5",
	}
)

// NewAdapter Create a casbin adapter
func NewAdapter(link string) (adp *adapter, err error) {
	adp = &adapter{table: defaultTableName}
	config := strings.SplitN(link, ":", 2)

	if len(config) != 2 {
		err = errInvalidDatabaseLink
		return
	}

	if adp.db, err = gdb.New(gdb.ConfigNode{Type: config[0], Link: config[1]}); err != nil {
		return
	}

	err = adp.createPolicyTable()

	return
}

func (a *adapter) model() *gdb.Model {
	return a.db.Model(a.table).Safe().Ctx(context.TODO())
}

// create a policy table when it's not exists.
func (a *adapter) createPolicyTable() (err error) {
	dbType := a.db.GetConfig().Type
	switch dbType {
	case consts.DBPgsql:
		_, err = a.db.Exec(context.TODO(), fmt.Sprintf(createPolicyTablePgSql, a.table, a.table, a.table))
	case consts.DBDm:
		// 1. 先创建表
		_, err = a.db.Exec(context.TODO(), fmt.Sprintf(createPolicyTableDmSql, a.table))
		if err != nil {
			return err
		}
		// 2. 再单独执行注释 (即使失败也不影响主流程)
		commentSql := fmt.Sprintf(`COMMENT ON TABLE "%s" IS '管理员_casbin权限表'`, a.table)
		_, _ = a.db.Exec(context.TODO(), commentSql)
	default:
		_, err = a.db.Exec(context.TODO(), fmt.Sprintf(createPolicyTableSql, a.table))
	}
	return
}

// drop policy table from the storage.
func (a *adapter) dropPolicyTable() (err error) {
	_, err = a.db.Exec(context.TODO(), fmt.Sprintf(dropPolicyTableSql, a.table))
	return
}

// LoadPolicy loads all policy rules from the storage.
func (a *adapter) LoadPolicy(model model.Model) (err error) {
	var rules []policyRule
	if err = a.model().Scan(&rules); err != nil {
		return
	}

	for _, rule := range rules {
		a.loadPolicyRule(rule, model)
	}
	return
}

// SavePolicy Saves all policy rules to the storage.
func (a *adapter) SavePolicy(model model.Model) (err error) {
	if err = a.dropPolicyTable(); err != nil {
		return
	}

	if err = a.createPolicyTable(); err != nil {
		return
	}

	policyRules := make([]policyRule, 0)

	for ptype, ast := range model["p"] {
		for _, rule := range ast.Policy {
			policyRules = append(policyRules, a.buildPolicyRule(ptype, rule))
		}
	}

	for ptype, ast := range model["g"] {
		for _, rule := range ast.Policy {
			policyRules = append(policyRules, a.buildPolicyRule(ptype, rule))
		}
	}

	if count := len(policyRules); count > 0 {
		if _, err = a.model().OmitEmptyData().FieldsEx(policyColumnsName.ID).Insert(policyRules); err != nil {
			return
		}
	}
	return
}

// AddPolicy adds a policy rule to the storage.
func (a *adapter) AddPolicy(sec string, ptype string, rule []string) (err error) {
	_, err = a.model().OmitEmptyData().FieldsEx(policyColumnsName.ID).Insert(a.buildPolicyRule(ptype, rule))
	return
}

// AddPolicies adds policy rules to the storage.
func (a *adapter) AddPolicies(sec string, ptype string, rules [][]string) (err error) {
	if len(rules) == 0 {
		return
	}

	policyRules := make([]policyRule, 0, len(rules))

	for _, rule := range rules {
		policyRules = append(policyRules, a.buildPolicyRule(ptype, rule))
	}

	_, err = a.model().OmitEmptyData().FieldsEx(policyColumnsName.ID).Insert(policyRules)
	return
}

// RemovePolicy removes a policy rule from the storage.
func (a *adapter) RemovePolicy(sec string, ptype string, rule []string) (err error) {
	db := a.model()
	db = db.Where(policyColumnsName.PType, ptype)
	for index := 0; index < len(rule); index++ {
		db = db.Where(fmt.Sprintf("v%d", index), rule[index])
	}
	_, err = db.Delete()
	return err
}

// RemoveFilteredPolicy removes policy rules that match the filter from the storage.
func (a *adapter) RemoveFilteredPolicy(sec string, ptype string, fieldIndex int, fieldValues ...string) (err error) {
	db := a.model()
	db = db.Where(policyColumnsName.PType, ptype)
	for index := 0; index <= 5; index++ {
		if fieldIndex <= index && index < fieldIndex+len(fieldValues) {
			db = db.Where(fmt.Sprintf("v%d", index), fieldValues[index-fieldIndex])
		}
	}
	_, err = db.Delete()
	return
}

// RemovePolicies removes policy rules from the storage (implements the persist.BatchAdapter interface).
func (a *adapter) RemovePolicies(sec string, ptype string, rules [][]string) (err error) {
	db := a.model()

	for _, rule := range rules {
		where := map[string]interface{}{policyColumnsName.PType: ptype}

		for i := 0; i <= 5; i++ {
			if len(rule) > i {
				where[fmt.Sprintf("v%d", i)] = rule[i]
			}
		}

		db = db.WhereOr(where)
	}

	_, err = db.Delete()
	return
}

// UpdatePolicy updates a policy rule from storage.
func (a *adapter) UpdatePolicy(sec string, ptype string, oldRule, newRule []string) (err error) {
	_, err = a.model().Update(a.buildPolicyRule(ptype, newRule), a.buildPolicyRule(ptype, oldRule))
	return
}

// UpdatePolicies updates some policy rules to storage, like db, redis.
func (a *adapter) UpdatePolicies(sec string, ptype string, oldRules, newRules [][]string) (err error) {
	if len(oldRules) == 0 || len(newRules) == 0 {
		return
	}
	return a.db.Transaction(context.TODO(), func(ctx context.Context, tx gdb.TX) error {
		for i := 0; i < int(math.Min(float64(len(oldRules)), float64(len(newRules)))); i++ {
			if _, err = tx.Model(a.table).Update(a.buildPolicyRule(ptype, newRules[i]), a.buildPolicyRule(ptype, oldRules[i])); err != nil {
				return err
			}
		}
		return nil
	})
}

// 加载策略规则
func (a *adapter) loadPolicyRule(rule policyRule, model model.Model) {
	ruleText := rule.PType

	if rule.V0 != "" {
		ruleText += ", " + rule.V0
	}

	if rule.V1 != "" {
		ruleText += ", " + rule.V1
	}

	if rule.V2 != "" {
		ruleText += ", " + rule.V2
	}

	if rule.V3 != "" {
		ruleText += ", " + rule.V3
	}

	if rule.V4 != "" {
		ruleText += ", " + rule.V4
	}

	if rule.V5 != "" {
		ruleText += ", " + rule.V5
	}
	if err := persist.LoadPolicyLine(ruleText, model); err != nil {
		panic(err)
	}
}

// 构建策略规则
func (a *adapter) buildPolicyRule(ptype string, data []string) policyRule {
	rule := policyRule{PType: ptype}

	if len(data) > 0 {
		rule.V0 = data[0]
	}

	if len(data) > 1 {
		rule.V1 = data[1]
	}

	if len(data) > 2 {
		rule.V2 = data[2]
	}

	if len(data) > 3 {
		rule.V3 = data[3]
	}

	if len(data) > 4 {
		rule.V4 = data[4]
	}

	if len(data) > 5 {
		rule.V5 = data[5]
	}
	return rule
}

```

## 个别表适配

达梦有比较多关键字，这里单独列出一个表（hg_sys_config）,`group` 字段按照自己需求改为其他，这里我改成了`config_group` ，然后修改对应的代码文件，这里不再展开


## 数据迁移

推荐使用[sqLark](https://www.sqlark.com/?s=eco-com-doc)，图形可视化操作，比较简单



## 性能对比

我在相同的硬件环境下，对 MySQL 和达梦进行了简单的性能测试：

### 测试环境
- CPU: Apple M4
- 内存: 32GB
- 磁盘: 512GB SSD
- 数据量: 10万条用户记录

### 查询性能

| 操作 | MySQL 8.0 | 达梦 DM8 | 差异 |
|------|-----------|----------|------|
| 主键查询 | 0.5ms | 0.6ms | +20% |
| 索引查询 | 2.1ms | 2.5ms | +19% |
| 全表扫描 | 156ms | 178ms | +14% |
| JOIN 查询 | 8.3ms | 9.7ms | +17% |
| 分页查询（前10页） | 3.2ms | 3.8ms | +19% |
| 分页查询（1000页后） | 45ms | 89ms | +98% |

### 写入性能

| 操作 | MySQL 8.0 | 达梦 DM8 | 差异 |
|------|-----------|----------|------|
| 单条插入 | 1.2ms | 1.5ms | +25% |
| 批量插入（100条） | 15ms | 19ms | +27% |
| 更新操作 | 1.8ms | 2.1ms | +17% |
| 删除操作 | 1.5ms | 1.7ms | +13% |

### 并发性能

| 并发数 | MySQL QPS | 达梦 QPS | 差异 |
|--------|-----------|----------|------|
| 10 | 1850 | 1620 | -12% |
| 50 | 4200 | 3680 | -12% |
| 100 | 5100 | 4350 | -15% |
| 200 | 5300 | 4200 | -21% |

### 性能总结

1. **整体性能**：达梦比 MySQL 慢 15-25%，但在可接受范围内
2. **大偏移量分页**：达梦的性能明显较差，需要优化分页方式
3. **并发能力**：MySQL 在高并发下表现更好
4. **稳定性**：两者都很稳定，没有出现异常



## 写在最后

整体来说，go的适配要比php简单一些。从 MySQL 迁移到达梦数据库，也不是不可完成的任务。关键是要：

1. **充分测试**：不要相信"应该没问题"，一定要全面测试
2. **做好备份**：迁移前务必做好数据备份
3. **分步实施**：先在测试环境验证，再逐步上线
4. **保留回退方案**：万一出问题能快速回退
5. **充分利用AI**：也是通过`gpt`,`claude Sonnet 4.5`,`Gemini`等多个ai合力完成

如果你也在做类似的国产化改造，希望这篇文章能给你一些参考。有问题欢迎在评论区交流。

## 参考资料

- [HotGo 官方文档](https://github.com/bufanyun/hotgo)
- [HotGo 达梦适配版本（本人维护）](https://github.com/DanRan-hcy/hotgo_dm) ⭐ 推荐
- [GoFrame 官方文档](https://goframe.org/)
- [达梦数据库官方文档](https://www.dameng.com/)
- [Go database/sql 包文档](https://pkg.go.dev/database/sql)

> 如果这篇文章对你有帮助，欢迎 Star 我的 [HotGo 达梦适配版本](https://github.com/DanRan-hcy/hotgo_dm)，已经完整适配并在生产环境稳定运行。


---

