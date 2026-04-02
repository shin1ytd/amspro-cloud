-- ============================================================
-- AmsPRO v6.0 — PostgreSQL 初期化スクリプト
-- SQLite版 seed_prod.js + server_complete.js migrate() の統合移植
-- ============================================================

-- ============================================================
-- 1. 事業部・センターマスター（GCP多拠点対応で新設）
-- ============================================================
CREATE TABLE IF NOT EXISTS divisions (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS centers (
  id          TEXT PRIMARY KEY,
  division_id TEXT NOT NULL REFERENCES divisions(id),
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 2. ユーザー
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'worker',
  email       TEXT NOT NULL DEFAULT '',
  div         TEXT NOT NULL DEFAULT 'bp',
  password    TEXT NOT NULL DEFAULT '',
  division_id TEXT REFERENCES divisions(id),
  center_id   TEXT REFERENCES centers(id),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. 工程マスター
-- ============================================================
CREATE TABLE IF NOT EXISTS stages (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL,
  div         TEXT NOT NULL DEFAULT 'bp',
  stage_order INTEGER NOT NULL DEFAULT 0,
  stage_group TEXT NOT NULL DEFAULT '',
  hrs         REAL NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- 4. 保留理由マスター
-- ============================================================
CREATE TABLE IF NOT EXISTS hold_reasons (
  id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code        TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 5. NG理由マスター
-- ============================================================
CREATE TABLE IF NOT EXISTS ng_reasons (
  id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  code        TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL,
  div         TEXT NOT NULL DEFAULT 'bp',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 6. 元受けマスター
-- ============================================================
CREATE TABLE IF NOT EXISTS upstreams (
  id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#1d4ed8',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- 7. 工程テンプレート
-- ============================================================
CREATE TABLE IF NOT EXISTS templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  div         TEXT NOT NULL DEFAULT 'bp',
  stage_ids   TEXT NOT NULL DEFAULT '[]',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 8. WIP制限
-- ============================================================
CREATE TABLE IF NOT EXISTS wip_limits (
  stage_id    TEXT NOT NULL,
  div         TEXT NOT NULL DEFAULT 'bp',
  wip_limit   INTEGER NOT NULL DEFAULT 5,
  PRIMARY KEY (stage_id, div)
);

-- ============================================================
-- 9. KPI目標
-- ============================================================
CREATE TABLE IF NOT EXISTS kpi_targets (
  div            TEXT NOT NULL,
  month          TEXT NOT NULL,
  sales_target   REAL NOT NULL DEFAULT 0,
  profit_target  REAL NOT NULL DEFAULT 0,
  count_target   INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (div, month)
);

-- ============================================================
-- 10. 顧客マスター
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kana        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_kana ON customers(kana);

-- ============================================================
-- 11. 車両メーカーマスター
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicle_makers (
  id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- 12. 車種マスター
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicle_models (
  id          INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  maker_id    INTEGER NOT NULL REFERENCES vehicle_makers(id),
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(maker_id, name)
);
CREATE INDEX IF NOT EXISTS idx_vmodels_maker ON vehicle_models(maker_id);

-- ============================================================
-- 13. 車両マスター
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT REFERENCES customers(id),
  maker         TEXT NOT NULL DEFAULT '',
  model         TEXT NOT NULL DEFAULT '',
  plate         TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT '',
  year          INTEGER,
  vin           TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate    ON vehicles(plate);

-- ============================================================
-- 14. 案件（jobs）
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id                  TEXT PRIMARY KEY,
  job_number          TEXT NOT NULL UNIQUE,
  customer_name       TEXT NOT NULL DEFAULT '',
  vehicle_name        TEXT NOT NULL DEFAULT '',
  vehicle_maker       TEXT NOT NULL DEFAULT '',
  vehicle_model       TEXT NOT NULL DEFAULT '',
  vehicle_plate       TEXT NOT NULL DEFAULT '',
  customer_id         TEXT REFERENCES customers(id),
  vehicle_id          TEXT REFERENCES vehicles(id),
  priority            TEXT NOT NULL DEFAULT 'normal',
  div                 TEXT NOT NULL DEFAULT 'bp',
  sub_type            TEXT NOT NULL DEFAULT '',
  entry_date          TEXT NOT NULL DEFAULT '',
  promised_delivery   TEXT,
  internal_deadline   TEXT,
  settlement_date     TEXT,
  estimate_amount     REAL NOT NULL DEFAULT 0,
  estimate_parts_cost REAL NOT NULL DEFAULT 0,
  estimate_labor_cost REAL NOT NULL DEFAULT 0,
  actual_amount       REAL,
  settlement_status   TEXT NOT NULL DEFAULT 'unsettled',
  status              TEXT NOT NULL DEFAULT 'in_progress',
  upstream            TEXT,
  front_owner_id      TEXT,
  created_by          TEXT,
  note                TEXT NOT NULL DEFAULT '',
  division_id         TEXT REFERENCES divisions(id),
  center_id           TEXT REFERENCES centers(id),
  version             INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_div ON jobs(div);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_center ON jobs(center_id);
CREATE INDEX IF NOT EXISTS idx_jobs_division ON jobs(division_id);

-- ============================================================
-- 15. タスク（tasks）
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_id        TEXT NOT NULL,
  sequence        INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',
  assignee_id     TEXT,
  finish_eta      TEXT,
  hold_reason_id  INTEGER,
  ng_reason_id    INTEGER,
  rework_count    INTEGER NOT NULL DEFAULT 0,
  note            TEXT NOT NULL DEFAULT '',
  completed_at    TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_job ON tasks(job_id);


-- ============================================================
-- マスターデータ投入
-- ============================================================

-- 事業部
INSERT INTO divisions (id, name, sort_order) VALUES
  ('div_bp', 'BP事業部（板金）', 1),
  ('div_hp', 'HP事業部（整備）', 2)
ON CONFLICT DO NOTHING;

-- センター（NTAの実拠点構成）
INSERT INTO centers (id, division_id, name, short_name, sort_order) VALUES
  ('ctr_honbu',    'div_bp', '本部',       '本部',     0),
  ('ctr_edogawa',  'div_bp', '江戸川センター', '江戸川', 1),
  ('ctr_tama',     'div_bp', '多摩センター',   '多摩',   2),
  ('ctr_asaka',    'div_bp', 'あさかセンター', 'あさか', 3),
  ('ctr_setagaya', 'div_bp', '世田谷センター', '世田谷', 4),
  ('ctr_nerima',   'div_bp', '練馬センター',   '練馬',   5),
  ('ctr_musashino', 'div_bp', '武蔵野センター', '武蔵野', 6)
ON CONFLICT DO NOTHING;

-- ユーザー（v5.2のサンプル＋division/center追加）
INSERT INTO users (id, name, role, email, div, password, division_id, center_id) VALUES
  ('u001', '有松 真一',   'admin',     'arimatsu@nta.local',   'bp', 'admin123',   'div_bp', 'ctr_honbu'),
  ('u002', '宮田 健太',   'manager',   'miyata@nta.local',     'bp', 'pass123',    'div_bp', 'ctr_edogawa'),
  ('u003', '田口 誠',     'front',     'taguchi@nta.local',    'bp', 'pass123',    'div_bp', 'ctr_edogawa'),
  ('u004', '岩崎 大輔',   'worker',    'iwasaki@nta.local',    'bp', 'pass123',    'div_bp', 'ctr_edogawa'),
  ('u005', '原田 正人',   'worker',    'harada@nta.local',     'bp', 'pass123',    'div_bp', 'ctr_tama'),
  ('u006', '山崎 隆',     'inspector', 'yamazaki@nta.local',   'bp', 'pass123',    'div_bp', 'ctr_tama'),
  ('u007', '笠原 博',     'parts',     'kasahara@nta.local',   'bp', 'pass123',    'div_bp', 'ctr_asaka'),
  ('u008', '石川 直樹',   'process',   'ishikawa@nta.local',   'hp', 'pass123',    'div_hp', 'ctr_edogawa'),
  ('u009', '水島 裕子',   'driver',    'mizushima@nta.local',  'bp', 'pass123',    'div_bp', 'ctr_edogawa'),
  ('u010', '佐川 亮太',   'manager',   'sagawa@nta.local',     'hp', 'pass123',    'div_hp', 'ctr_edogawa')
ON CONFLICT DO NOTHING;

-- BP工程マスター
INSERT INTO stages (id, code, name, div, stage_order, stage_group, hrs) VALUES
  ('bp_recv',       'recv',       '受付',           'bp', 1,  'front',    0.5),
  ('bp_estimate',   'estimate',   '見積',           'bp', 2,  'front',    2),
  ('bp_order',      'order',      '部品待ち',       'bp', 3,  'parts',    1),
  ('bp_disassemble','disassemble','メカ分解',       'bp', 4,  'work',     4),
  ('bp_sheet',      'sheet',      '板金',           'bp', 5,  'work',     8),
  ('bp_paint',      'paint',      '塗装',           'bp', 6,  'work',     6),
  ('bp_assemble',   'assemble',   '組付',           'bp', 7,  'work',     4),
  ('bp_system',     'system',     'システム設定',   'bp', 8,  'work',     1),
  ('bp_inspect',    'inspect',    '検査',           'bp', 9,  'inspect',  1),
  ('bp_finish',     'finish',     '仕上',           'bp', 10, 'finish',   2),
  ('bp_delivery',   'delivery',   '納車',           'bp', 11, 'delivery', 0.5),
  ('bp_pickup',     'pickup',     '引取り',         'bp', 12, 'transfer', 0.5),
  ('bp_reservation','reservation','予約',           'bp', 0,  'transfer', 0)
ON CONFLICT DO NOTHING;

-- HP工程マスター
INSERT INTO stages (id, code, name, div, stage_order, stage_group, hrs) VALUES
  ('hp_recv',       'recv',       '受付',           'hp', 1,  'front',    0.5),
  ('hp_inspect',    'inspect',    '点検・診断',     'hp', 2,  'inspect',  1.5),
  ('hp_estimate',   'estimate',   '見積',           'hp', 3,  'front',    1),
  ('hp_order',      'order',      '部品発注',       'hp', 4,  'parts',    1),
  ('hp_work',       'work',       '整備作業',       'hp', 5,  'work',     3),
  ('hp_test',       'test',       '完成検査',       'hp', 6,  'inspect',  1),
  ('hp_wash',       'wash',       '洗車・清掃',     'hp', 7,  'finish',   0.5),
  ('hp_delivery',   'delivery',   '納車',           'hp', 8,  'delivery', 0.5),
  ('hp_pickup',     'pickup',     '引取り',         'hp', 9,  'transfer', 0.5),
  ('hp_reservation','reservation','予約',           'hp', 0,  'transfer', 0)
ON CONFLICT DO NOTHING;

-- 保留理由
INSERT INTO hold_reasons (code, name, sort_order) VALUES
  ('parts_wait',    '部品待ち',          1),
  ('customer_wait', 'お客様確認待ち',    2),
  ('insurance_wait','保険会社確認待ち',  3),
  ('space_wait',    'スペース空き待ち',  4),
  ('other',         'その他',            5);

-- NG理由（BP）
INSERT INTO ng_reasons (code, name, div, sort_order) VALUES
  ('color_diff',  '色違い',       'bp', 1),
  ('texture',     '肌不良',       'bp', 2),
  ('scratch',     'キズ・打痕',   'bp', 3),
  ('fit',         '建付不良',     'bp', 4),
  ('other_bp',    'その他',       'bp', 5);

-- NG理由（HP）
INSERT INTO ng_reasons (code, name, div, sort_order) VALUES
  ('oil_leak',    'オイル漏れ',   'hp', 1),
  ('noise',       '異音',         'hp', 2),
  ('vibration',   '振動',         'hp', 3),
  ('electric',    '電装不良',     'hp', 4),
  ('other_hp',    'その他',       'hp', 5);

-- 元受け
INSERT INTO upstreams (name, color, sort_order) VALUES
  ('自社入庫',            '#1d4ed8', 1),
  ('ディーラー',          '#7c3aed', 2),
  ('損保ジャパン',        '#047857', 3),
  ('東京海上日動',        '#b45309', 4),
  ('あいおいニッセイ同和', '#b91c1c', 5),
  ('三井住友海上',        '#6366f1', 6),
  ('その他保険会社',      '#64748b', 7);

-- テンプレート（BP）
INSERT INTO templates (id, name, div, stage_ids, sort_order) VALUES
  ('bp_standard', '標準板金（全工程）', 'bp',
   '["bp_recv","bp_estimate","bp_order","bp_disassemble","bp_sheet","bp_paint","bp_assemble","bp_system","bp_inspect","bp_finish","bp_delivery"]', 1),
  ('bp_light',    '軽板金（塗装なし）', 'bp',
   '["bp_recv","bp_estimate","bp_sheet","bp_inspect","bp_finish","bp_delivery"]', 2),
  ('bp_paint_only','塗装のみ', 'bp',
   '["bp_recv","bp_estimate","bp_paint","bp_inspect","bp_finish","bp_delivery"]', 3)
ON CONFLICT DO NOTHING;

-- テンプレート（HP）
INSERT INTO templates (id, name, div, stage_ids, sort_order) VALUES
  ('hp_inspection','車検・法定点検', 'hp',
   '["hp_recv","hp_inspect","hp_estimate","hp_order","hp_work","hp_test","hp_wash","hp_delivery"]', 1),
  ('hp_repair',    '一般整備', 'hp',
   '["hp_recv","hp_inspect","hp_estimate","hp_work","hp_test","hp_delivery"]', 2),
  ('hp_quick',     'クイック整備', 'hp',
   '["hp_recv","hp_work","hp_test","hp_delivery"]', 3)
ON CONFLICT DO NOTHING;

-- 車両メーカー
INSERT INTO vehicle_makers (name, sort_order) VALUES
  ('トヨタ', 0), ('ホンダ', 1), ('日産', 2), ('マツダ', 3),
  ('スバル', 4), ('三菱', 5), ('スズキ', 6), ('ダイハツ', 7),
  ('レクサス', 8), ('いすゞ', 9), ('日野', 10), ('三菱ふそう', 11),
  ('UDトラックス', 12), ('BMW', 13), ('メルセデス・ベンツ', 14),
  ('アウディ', 15), ('フォルクスワーゲン', 16), ('ボルボ', 17),
  ('プジョー', 18), ('ルノー', 19), ('フォード', 20), ('GM', 21),
  ('クライスラー', 22), ('テスラ', 23), ('ポルシェ', 24),
  ('フェラーリ', 25), ('ランボルギーニ', 26), ('その他', 27)
ON CONFLICT DO NOTHING;

-- トヨタ主要車種
INSERT INTO vehicle_models (maker_id, name, sort_order)
SELECT vm.id, m.name, m.ord FROM vehicle_makers vm,
  (VALUES ('プリウス',0),('カローラ',1),('ヴォクシー',2),('アルファード',3),
          ('ハイエース',4),('ランドクルーザー',5),('ヤリス',6),('アクア',7),
          ('ノア',8),('C-HR',9),('RAV4',10),('クラウン',11),('カムリ',12)
  ) AS m(name, ord)
WHERE vm.name = 'トヨタ'
ON CONFLICT DO NOTHING;

-- ホンダ主要車種
INSERT INTO vehicle_models (maker_id, name, sort_order)
SELECT vm.id, m.name, m.ord FROM vehicle_makers vm,
  (VALUES ('フィット',0),('ステップワゴン',1),('フリード',2),('N-BOX',3),
          ('ヴェゼル',4),('CR-V',5),('シビック',6),('アコード',7),('レジェンド',8)
  ) AS m(name, ord)
WHERE vm.name = 'ホンダ'
ON CONFLICT DO NOTHING;

-- デフォルトWIP制限（BP）
INSERT INTO wip_limits (stage_id, div, wip_limit) VALUES
  ('bp_recv', 'bp', 10), ('bp_estimate', 'bp', 5), ('bp_order', 'bp', 8),
  ('bp_disassemble', 'bp', 4), ('bp_sheet', 'bp', 4), ('bp_paint', 'bp', 3),
  ('bp_assemble', 'bp', 4), ('bp_system', 'bp', 4), ('bp_inspect', 'bp', 5), ('bp_finish', 'bp', 5),
  ('bp_delivery', 'bp', 10)
ON CONFLICT DO NOTHING;

-- デフォルトWIP制限（HP）
INSERT INTO wip_limits (stage_id, div, wip_limit) VALUES
  ('hp_recv', 'hp', 15), ('hp_inspect', 'hp', 8), ('hp_estimate', 'hp', 8),
  ('hp_order', 'hp', 10), ('hp_work', 'hp', 6), ('hp_test', 'hp', 8),
  ('hp_wash', 'hp', 10), ('hp_delivery', 'hp', 15)
ON CONFLICT DO NOTHING;
