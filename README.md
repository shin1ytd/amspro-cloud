# Ams PRO v6.0 — Cloud Run + PostgreSQL 版

NTA工程管理システム  
v5.2（SQLite版）からの移植。Cloud Run + Cloud SQL for PostgreSQL 対応。

## 変更点（v5.2 → v6.0）

| 項目 | v5.2 | v6.0 |
|---|---|---|
| DB | SQLite (better-sqlite3) | PostgreSQL (pg) |
| 実行基盤 | ローカルLAN | Docker / Cloud Run |
| 多拠点対応 | なし | divisions / centers テーブル追加 |
| 環境切替 | 不可 | 環境変数で切替 |

## ファイル構成

```
amspro-cloud/
├── server.js            ← PostgreSQL版サーバー
├── package.json         ← 依存パッケージ
├── Dockerfile           ← Cloud Run用
├── docker-compose.yml   ← ローカル開発用
├── .env.example         ← 環境変数テンプレート
├── .gitignore
├── .dockerignore
├── db/
│   └── init.sql         ← PostgreSQL初期化（テーブル＋マスターデータ）
└── public/
    ├── index.html       ← エントリポイント
    ├── app.js           ← フロントエンド（v5.2そのまま）
    └── style.css        ← スタイルシート
```

## ローカル開発（Docker）

```bash
# 起動（PostgreSQL + アプリが立ち上がる）
docker compose up -d

# ブラウザで確認
open http://localhost:3000

# ログ確認
docker compose logs -f

# 停止
docker compose down
```

## テストログイン

| メール | パスワード | 役割 |
|---|---|---|
| arimatsu@nta.local | admin123 | 管理者 |
| miyata@nta.local | pass123 | 工場長 |
| taguchi@nta.local | pass123 | フロント |

## フロントエンドについて

`public/app.js` は v5.2 のフロントエンドをそのまま使用しています。  
サーバーAPIのインターフェースは同一に保っているため、変更不要です。
