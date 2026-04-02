// ============================================================
// server.js — Ams PRO v6.0 (Cloud Run + PostgreSQL版)
// SQLite版 v5.2 からの移植:
//   - better-sqlite3 → pg (Pool)
//   - datetime('now','localtime') → NOW()
//   - PRAGMA → 不要
//   - division_id / center_id 対応
//   - 環境変数でDB接続先を切替
// ============================================================
'use strict';

const express = require('express');
const { Pool }  = require('pg');
const cors    = require('cors');
const path    = require('path');

const PORT = process.env.PORT || 3000;

// ============================================================
// PostgreSQL接続（環境変数から読み取り）
// ============================================================
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'amspro',
  user:     process.env.DB_USER     || 'amspro',
  password: process.env.DB_PASSWORD || 'amspro_dev',
  // Cloud SQL経由の場合
  ...(process.env.DB_SOCKET_PATH ? {
    host: process.env.DB_SOCKET_PATH,
  } : {}),
});

// 接続テスト
pool.query('SELECT NOW()').then(() => {
  console.log('✅ PostgreSQL 接続成功');
}).catch(e => {
  console.error('❌ PostgreSQL 接続失敗:', e.message);
  process.exit(1);
});

// ============================================================
// app setup
// ============================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ok(res, data)             { res.json({ ok: true, data }); }
function err(res, msg, status=400) { res.status(status).json({ ok: false, error: msg }); }

// ============================================================
// マスター一括取得
// ============================================================
app.get('/api/masters', async (req, res) => {
  try {
    const [users, stages, holdReasons, ngReasons, upstreams, templates, wipLimits, kpiTargets, makers] = await Promise.all([
      pool.query('SELECT * FROM users WHERE active=1 ORDER BY id'),
      pool.query('SELECT * FROM stages ORDER BY div, stage_order'),
      pool.query('SELECT * FROM hold_reasons ORDER BY sort_order'),
      pool.query('SELECT * FROM ng_reasons ORDER BY div, sort_order'),
      pool.query('SELECT * FROM upstreams WHERE active=1 ORDER BY sort_order'),
      pool.query('SELECT * FROM templates ORDER BY div, id'),
      pool.query('SELECT * FROM wip_limits'),
      pool.query('SELECT * FROM kpi_targets ORDER BY div, month'),
      pool.query('SELECT * FROM vehicle_makers ORDER BY sort_order'),
    ]);
    const templatesP = templates.rows.map(t => ({ ...t, stage_ids: JSON.parse(t.stage_ids) }));
    ok(res, {
      users: users.rows, stages: stages.rows, holdReasons: holdReasons.rows,
      ngReasons: ngReasons.rows, upstreams: upstreams.rows,
      templates: templatesP, wipLimits: wipLimits.rows,
      kpiTargets: kpiTargets.rows, vehicleMakers: makers.rows,
    });
  } catch (e) { err(res, e.message, 500); }
});

// ============================================================
// 顧客マスター CRUD
// ============================================================
app.get('/api/customers', async (req, res) => {
  try {
    const { q } = req.query;
    let sql = 'SELECT * FROM customers WHERE active=1';
    const params = [];
    if (q) {
      sql += ` AND (name LIKE $1 OR kana LIKE $2 OR phone LIKE $3)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY kana, name LIMIT 100';
    ok(res, (await pool.query(sql, params)).rows);
  } catch (e) { err(res, e.message, 500); }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const c = (await pool.query('SELECT * FROM customers WHERE id=$1', [req.params.id])).rows[0];
    if (!c) return err(res, '顧客が見つかりません', 404);
    const vehicles = (await pool.query('SELECT * FROM vehicles WHERE customer_id=$1 AND active=1 ORDER BY updated_at DESC', [c.id])).rows;
    ok(res, { ...c, vehicles });
  } catch (e) { err(res, e.message, 500); }
});

app.post('/api/customers', async (req, res) => {
  try {
    const { name, kana='', phone='', email='', address='', note='' } = req.body;
    if (!name) return err(res, '顧客名は必須です');
    const id = 'c' + Date.now();
    await pool.query(
      `INSERT INTO customers(id,name,kana,phone,email,address,note) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [id, name, kana, phone, email, address, note]
    );
    ok(res, (await pool.query('SELECT * FROM customers WHERE id=$1', [id])).rows[0]);
  } catch (e) { err(res, e.message, 500); }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const c = (await pool.query('SELECT * FROM customers WHERE id=$1', [req.params.id])).rows[0];
    if (!c) return err(res, '顧客が見つかりません', 404);
    const { name, kana, phone, email, address, note } = req.body;
    await pool.query(
      `UPDATE customers SET name=$1,kana=$2,phone=$3,email=$4,address=$5,note=$6,updated_at=NOW() WHERE id=$7`,
      [name??c.name, kana??c.kana, phone??c.phone, email??c.email, address??c.address, note??c.note, c.id]
    );
    ok(res, (await pool.query('SELECT * FROM customers WHERE id=$1', [c.id])).rows[0]);
  } catch (e) { err(res, e.message, 500); }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    await pool.query("UPDATE customers SET active=0,updated_at=NOW() WHERE id=$1", [req.params.id]);
    ok(res, { id: req.params.id });
  } catch (e) { err(res, e.message, 500); }
});

// ============================================================
// 車両マスター CRUD
// ============================================================
app.get('/api/vehicles', async (req, res) => {
  try {
    const { q, customer_id } = req.query;
    let sql = 'SELECT * FROM vehicles WHERE active=1';
    const params = [];
    let idx = 1;
    if (customer_id) { sql += ` AND customer_id=$${idx++}`; params.push(customer_id); }
    if (q) { sql += ` AND (maker LIKE $${idx++} OR model LIKE $${idx++} OR plate LIKE $${idx++})`; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    sql += ' ORDER BY updated_at DESC LIMIT 100';
    ok(res, (await pool.query(sql, params)).rows);
  } catch (e) { err(res, e.message, 500); }
});

app.post('/api/vehicles', async (req, res) => {
  try {
    const { customer_id=null, maker='', model='', plate='', color='', year=null, vin='', note='' } = req.body;
    const id = 'v' + Date.now();
    await pool.query(
      `INSERT INTO vehicles(id,customer_id,maker,model,plate,color,year,vin,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, customer_id, maker, model, plate, color, year, vin, note]
    );
    ok(res, (await pool.query('SELECT * FROM vehicles WHERE id=$1', [id])).rows[0]);
  } catch (e) { err(res, e.message, 500); }
});

app.put('/api/vehicles/:id', async (req, res) => {
  try {
    const v = (await pool.query('SELECT * FROM vehicles WHERE id=$1', [req.params.id])).rows[0];
    if (!v) return err(res, '車両が見つかりません', 404);
    const { customer_id, maker, model, plate, color, year, vin, note } = req.body;
    await pool.query(
      `UPDATE vehicles SET customer_id=$1,maker=$2,model=$3,plate=$4,color=$5,year=$6,vin=$7,note=$8,updated_at=NOW() WHERE id=$9`,
      [customer_id??v.customer_id, maker??v.maker, model??v.model, plate??v.plate,
       color??v.color, year??v.year, vin??v.vin, note??v.note, v.id]
    );
    ok(res, (await pool.query('SELECT * FROM vehicles WHERE id=$1', [v.id])).rows[0]);
  } catch (e) { err(res, e.message, 500); }
});

// ============================================================
// 車両メーカー・車種マスター
// ============================================================
app.get('/api/vehicle-makers', async (req, res) => {
  try {
    const makers = (await pool.query('SELECT * FROM vehicle_makers ORDER BY sort_order')).rows;
    const models = (await pool.query('SELECT * FROM vehicle_models ORDER BY maker_id, sort_order')).rows;
    ok(res, { makers, models });
  } catch (e) { err(res, e.message, 500); }
});

app.post('/api/vehicle-makers', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return err(res, 'メーカー名は必須です');
    const max = (await pool.query('SELECT COALESCE(MAX(sort_order),0) as m FROM vehicle_makers')).rows[0].m;
    await pool.query('INSERT INTO vehicle_makers(name,sort_order) VALUES($1,$2) ON CONFLICT DO NOTHING', [name, max+1]);
    ok(res, (await pool.query('SELECT * FROM vehicle_makers ORDER BY sort_order')).rows);
  } catch (e) { err(res, e.message, 500); }
});

app.post('/api/vehicle-models', async (req, res) => {
  try {
    const { maker_id, name } = req.body;
    if (!maker_id || !name) return err(res, 'maker_idとnameは必須です');
    const max = (await pool.query('SELECT COALESCE(MAX(sort_order),0) as m FROM vehicle_models WHERE maker_id=$1', [maker_id])).rows[0].m;
    await pool.query('INSERT INTO vehicle_models(maker_id,name,sort_order) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [maker_id, name, max+1]);
    ok(res, (await pool.query('SELECT * FROM vehicle_models WHERE maker_id=$1 ORDER BY sort_order', [maker_id])).rows);
  } catch (e) { err(res, e.message, 500); }
});

// ============================================================
// 案件一覧
// ============================================================
app.get('/api/jobs', async (req, res) => {
  try {
    const { div, status, upstream, q } = req.query;
    let where = [], params = [];
    let idx = 1;
    if (div && div !== 'all')           { where.push(`j.div = $${idx++}`);           params.push(div); }
    if (status && status !== 'all')     { where.push(`j.status = $${idx++}`);        params.push(status); }
    if (upstream && upstream !== 'all') { where.push(`j.upstream = $${idx++}`);      params.push(upstream); }
    if (q) {
      where.push(`(j.customer_name LIKE $${idx} OR j.vehicle_name LIKE $${idx} OR j.job_number LIKE $${idx}
        OR j.vehicle_maker LIKE $${idx} OR j.vehicle_model LIKE $${idx} OR j.vehicle_plate LIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const jobs = (await pool.query(`SELECT * FROM jobs j ${whereStr} ORDER BY j.entry_date DESC`, params)).rows;
    const jobIds = jobs.map(j => j.id);
    let tasks = [];
    if (jobIds.length > 0) {
      const ph = jobIds.map((_, i) => `$${i+1}`).join(',');
      tasks = (await pool.query(`SELECT * FROM tasks WHERE job_id IN (${ph}) ORDER BY job_id, sequence`, jobIds)).rows;
    }
    const taskMap = {};
    for (const t of tasks) { if (!taskMap[t.job_id]) taskMap[t.job_id] = []; taskMap[t.job_id].push(t); }
    ok(res, jobs.map(j => ({ ...j, tasks: taskMap[j.id] || [] })));
  } catch (e) { err(res, e.message, 500); }
});

// ============================================================
// CSV出力
// ============================================================
app.get('/api/jobs/csv', async (req, res) => {
  try {
    const { role, center_id, div, date_from, date_to } = req.query;
    if (!['admin','manager'].includes(role)) return res.status(403).send('権限がありません');

    let where = [], params = [];
    let idx = 1;
    if (role === 'manager' && center_id) { where.push(`j.center_id = $${idx++}`); params.push(center_id); }
    if (div && div !== 'all')       { where.push(`j.div = $${idx++}`);         params.push(div); }
    if (date_from)                  { where.push(`j.entry_date >= $${idx++}`); params.push(date_from); }
    if (date_to)                    { where.push(`j.entry_date <= $${idx++}`); params.push(date_to); }
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const jobs = (await pool.query(`
      SELECT j.job_number, j.entry_date, j.div, j.customer_name,
        j.vehicle_maker, j.vehicle_model, j.vehicle_plate, j.vehicle_name,
        j.priority, j.upstream, j.promised_delivery, j.settlement_date,
        j.estimate_amount, j.estimate_parts_cost, j.estimate_labor_cost,
        j.actual_amount, j.settlement_status, j.status,
        u.name AS front_name, j.note, j.created_at, j.updated_at
      FROM jobs j LEFT JOIN users u ON u.id = j.front_owner_id
      ${whereStr} ORDER BY j.entry_date DESC
    `, params)).rows;

    const HEADERS = ['案件番号','受付日','事業','顧客名','メーカー','車種','登録番号','車両名(旧)',
      '優先度','元受け','約束納車日','清算予定日','見込み売上','見込み部品原価','見込み工賃',
      '実績金額','清算状況','進捗ステータス','担当フロント','備考','登録日時','更新日時'];
    const STATUS_JP = {in_progress:'進行中',completed:'完了',cancelled:'キャンセル',open:'受付'};
    const SETTLE_JP = {unsettled:'未清算',settled:'清算済',cancelled:'取消'};
    const PRI_JP = {urgent:'緊急',high:'急ぎ',normal:'通常',low:'余裕'};
    const DIV_JP = {bp:'BP（板金）',hp:'HP（整備）'};
    const escape = v => { if(v==null)return''; const s=String(v); if(s.includes(',')||s.includes('"')||s.includes('\n'))return`"${s.replace(/"/g,'""')}"`; return s; };
    const rows = jobs.map(j => [j.job_number,j.entry_date,DIV_JP[j.div]||j.div,j.customer_name,
      j.vehicle_maker||'',j.vehicle_model||'',j.vehicle_plate||'',j.vehicle_name||'',
      PRI_JP[j.priority]||j.priority,j.upstream||'',j.promised_delivery||'',j.settlement_date||'',
      j.estimate_amount||0,j.estimate_parts_cost||0,j.estimate_labor_cost||0,j.actual_amount||'',
      SETTLE_JP[j.settlement_status]||j.settlement_status,STATUS_JP[j.status]||j.status,
      j.front_name||'',j.note||'',j.created_at||'',j.updated_at||''].map(escape).join(','));
    const bom = '\uFEFF';
    const csv = bom + [HEADERS.join(','), ...rows].join('\r\n');
    const now = new Date().toISOString().slice(0,10).replace(/-/g,'');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`amspro_jobs_${now}.csv`)}`);
    res.send(csv);
  } catch (e) { err(res, e.message, 500); }
});

// ============================================================
// 案件詳細
// ============================================================
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = (await pool.query('SELECT * FROM jobs WHERE id=$1', [req.params.id])).rows[0];
    if (!job) return err(res, '案件が見つかりません', 404);
    const tasks = (await pool.query('SELECT * FROM tasks WHERE job_id=$1 ORDER BY sequence', [job.id])).rows;
    ok(res, { ...job, tasks });
  } catch (e) { err(res, e.message, 500); }
});

// ============================================================
// 案件登録
// ============================================================
app.post('/api/jobs', async (req, res) => {
  try {
    const { tasks = [], ...jobData } = req.body;
    const exists = (await pool.query('SELECT id FROM jobs WHERE job_number=$1', [jobData.job_number])).rows[0];
    if (exists) return err(res, '同じ案件番号が既に存在します');

    if (jobData.vehicle_name && !jobData.vehicle_maker) {
      const parts = jobData.vehicle_name.split(/[\s\u3000]+/);
      jobData.vehicle_maker = parts[0] || '';
      jobData.vehicle_model = parts[1] || '';
      jobData.vehicle_plate = parts.slice(2).join(' ') || '';
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO jobs(id,job_number,customer_name,vehicle_name,
          vehicle_maker,vehicle_model,vehicle_plate,customer_id,vehicle_id,
          priority,div,sub_type,entry_date,promised_delivery,internal_deadline,settlement_date,
          estimate_amount,estimate_parts_cost,estimate_labor_cost,
          upstream,front_owner_id,created_by,note,status,settlement_status,
          division_id,center_id,version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
      `, [
        jobData.id, jobData.job_number, jobData.customer_name||'', jobData.vehicle_name||'',
        jobData.vehicle_maker||'', jobData.vehicle_model||'', jobData.vehicle_plate||'',
        jobData.customer_id||null, jobData.vehicle_id||null,
        jobData.priority||'normal', jobData.div||'bp', jobData.sub_type||'',
        jobData.entry_date||'', jobData.promised_delivery||null,
        jobData.internal_deadline||null,
        jobData.settlement_date||jobData.promised_delivery||jobData.entry_date||null,
        jobData.estimate_amount||0, jobData.estimate_parts_cost||0, jobData.estimate_labor_cost||0,
        jobData.upstream||null, jobData.front_owner_id||null, jobData.created_by||null,
        jobData.note||'', jobData.status||'in_progress', jobData.settlement_status||'unsettled',
        jobData.division_id||null, jobData.center_id||null, 1,
      ]);

      for (const t of tasks) {
        await client.query(`
          INSERT INTO tasks(id,job_id,stage_id,sequence,status,assignee_id,finish_eta,
            hold_reason_id,ng_reason_id,rework_count,note,completed_at,version)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        `, [
          t.id, jobData.id, t.stage_id||t.stageId, t.sequence||0,
          t.status||'pending', t.assignee_id||t.assigneeId||null,
          t.finish_eta||t.finishEta||null,
          t.hold_reason_id||t.holdReasonId||null, t.ng_reason_id||t.ngReasonId||null,
          t.rework_count||t.reworkCount||0, t.note||'', t.completed_at||t.completedAt||null, 1,
        ]);
      }
      await client.query('COMMIT');
    } catch (te) {
      await client.query('ROLLBACK');
      throw te;
    } finally {
      client.release();
    }

    const created = (await pool.query('SELECT * FROM jobs WHERE id=$1', [jobData.id])).rows[0];
    const createdTasks = (await pool.query('SELECT * FROM tasks WHERE job_id=$1 ORDER BY sequence', [jobData.id])).rows;
    ok(res, { ...created, tasks: createdTasks });
  } catch (e) { err(res, e.message, 500); }
});

// ============================================================
// 案件更新
// ============================================================
app.put('/api/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params, body = req.body;
    const current = (await pool.query('SELECT * FROM jobs WHERE id=$1', [id])).rows[0];
    if (!current) return err(res, '案件が見つかりません', 404);
    if (body.version !== undefined && body.version !== current.version) {
      return err(res, `競合が発生しました。(server:${current.version} / client:${body.version})`, 409);
    }

    let vMaker = body.vehicle_maker ?? current.vehicle_maker ?? '';
    let vModel = body.vehicle_model ?? current.vehicle_model ?? '';
    let vPlate = body.vehicle_plate ?? current.vehicle_plate ?? '';
    if (body.vehicle_name && !body.vehicle_maker) {
      const parts = body.vehicle_name.split(/[\s\u3000]+/);
      vMaker = parts[0] || current.vehicle_maker || '';
      vModel = parts[1] || current.vehicle_model || '';
      vPlate = parts.slice(2).join(' ') || current.vehicle_plate || '';
    }

    await pool.query(`
      UPDATE jobs SET
        customer_name=$1, vehicle_name=$2,
        vehicle_maker=$3, vehicle_model=$4, vehicle_plate=$5,
        customer_id=$6, vehicle_id=$7,
        priority=$8, promised_delivery=$9, internal_deadline=$10,
        settlement_date=$11, estimate_amount=$12, estimate_parts_cost=$13,
        estimate_labor_cost=$14, actual_amount=$15, settlement_status=$16,
        status=$17, upstream=$18, front_owner_id=$19, note=$20,
        version=version+1, updated_at=NOW()
      WHERE id=$21
    `, [
      body.customer_name??current.customer_name, body.vehicle_name??current.vehicle_name,
      vMaker, vModel, vPlate,
      body.customer_id??current.customer_id, body.vehicle_id??current.vehicle_id,
      body.priority??current.priority,
      body.promised_delivery!==undefined?body.promised_delivery:current.promised_delivery,
      body.internal_deadline!==undefined?body.internal_deadline:current.internal_deadline,
      body.settlement_date!==undefined?body.settlement_date:current.settlement_date,
      body.estimate_amount!==undefined?body.estimate_amount:current.estimate_amount,
      body.estimate_parts_cost!==undefined?body.estimate_parts_cost:current.estimate_parts_cost,
      body.estimate_labor_cost!==undefined?body.estimate_labor_cost:current.estimate_labor_cost,
      body.actual_amount!==undefined?body.actual_amount:current.actual_amount,
      body.settlement_status??current.settlement_status,
      body.status??current.status,
      body.upstream!==undefined?body.upstream:current.upstream,
      body.front_owner_id!==undefined?body.front_owner_id:current.front_owner_id,
      body.note!==undefined?body.note:current.note,
      id,
    ]);

    const updated = (await pool.query('SELECT * FROM jobs WHERE id=$1', [id])).rows[0];
    const tasks = (await pool.query('SELECT * FROM tasks WHERE job_id=$1 ORDER BY sequence', [id])).rows;
    ok(res, { ...updated, tasks });
  } catch (e) { err(res, e.message, 500); }
});

// ============================================================
// タスク更新
// ============================================================
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params, body = req.body;
    const current = (await pool.query('SELECT * FROM tasks WHERE id=$1', [id])).rows[0];
    if (!current) return err(res, 'タスクが見つかりません', 404);
    if (body.version !== undefined && body.version !== current.version)
      return err(res, `競合: server=${current.version} client=${body.version}`, 409);
    await pool.query(`UPDATE tasks SET status=$1,assignee_id=$2,finish_eta=$3,hold_reason_id=$4,ng_reason_id=$5,rework_count=$6,note=$7,completed_at=$8,version=version+1,updated_at=NOW() WHERE id=$9`, [
      body.status??current.status, body.assignee_id??current.assignee_id,
      body.finish_eta!==undefined?body.finish_eta:current.finish_eta,
      body.hold_reason_id!==undefined?body.hold_reason_id:current.hold_reason_id,
      body.ng_reason_id!==undefined?body.ng_reason_id:current.ng_reason_id,
      body.rework_count??current.rework_count, body.note??current.note,
      body.completed_at!==undefined?body.completed_at:current.completed_at,
      id,
    ]);
    ok(res, (await pool.query('SELECT * FROM tasks WHERE id=$1', [id])).rows[0]);
  } catch (e) { err(res, e.message, 500); }
});

// ============================================================
// その他マスター系API
// ============================================================
app.get('/api/upstreams', async (req, res) => { try { ok(res, (await pool.query('SELECT * FROM upstreams WHERE active=1 ORDER BY sort_order')).rows); } catch(e){ err(res,e.message,500); }});
app.post('/api/upstreams', async (req, res) => { try { const{name,color='#1d4ed8'}=req.body; if(!name)return err(res,'nameは必須です'); const m=(await pool.query('SELECT COALESCE(MAX(sort_order),0) as m FROM upstreams')).rows[0].m; await pool.query('INSERT INTO upstreams(name,color,sort_order) VALUES($1,$2,$3)',[name,color,m+1]); ok(res,(await pool.query('SELECT * FROM upstreams WHERE active=1 ORDER BY sort_order')).rows); }catch(e){err(res,e.message,500);}});
app.put('/api/upstreams/:id', async (req, res) => { try { const{name,color}=req.body; await pool.query('UPDATE upstreams SET name=COALESCE($1,name),color=COALESCE($2,color) WHERE id=$3',[name||null,color||null,req.params.id]); ok(res,(await pool.query('SELECT * FROM upstreams WHERE active=1 ORDER BY sort_order')).rows); }catch(e){err(res,e.message,500);}});
app.delete('/api/upstreams/:id', async (req, res) => { try { await pool.query('UPDATE upstreams SET active=0 WHERE id=$1',[req.params.id]); ok(res,(await pool.query('SELECT * FROM upstreams WHERE active=1 ORDER BY sort_order')).rows); }catch(e){err(res,e.message,500);}});
app.put('/api/wip-limits', async (req, res) => { try { const client=await pool.connect(); try{ await client.query('BEGIN'); for(const l of req.body){ await client.query('INSERT INTO wip_limits(stage_id,div,wip_limit) VALUES($1,$2,$3) ON CONFLICT(stage_id,div) DO UPDATE SET wip_limit=$3',[l.stage_id,l.div,l.wip_limit]); } await client.query('COMMIT'); }catch(te){await client.query('ROLLBACK');throw te;}finally{client.release();} ok(res,(await pool.query('SELECT * FROM wip_limits')).rows); }catch(e){err(res,e.message,500);}});
app.put('/api/kpi-targets', async (req, res) => { try { const client=await pool.connect(); try{ await client.query('BEGIN'); for(const t of req.body){ await client.query(`INSERT INTO kpi_targets(div,month,sales_target,profit_target,count_target,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(div,month) DO UPDATE SET sales_target=$3,profit_target=$4,count_target=$5,updated_at=NOW()`,[t.div,t.month,t.sales_target,t.profit_target,t.count_target]); } await client.query('COMMIT'); }catch(te){await client.query('ROLLBACK');throw te;}finally{client.release();} ok(res,(await pool.query('SELECT * FROM kpi_targets ORDER BY div,month')).rows); }catch(e){err(res,e.message,500);}});
app.get('/api/users', async (req, res) => { try { ok(res, (await pool.query('SELECT * FROM users WHERE active=1 ORDER BY id')).rows); }catch(e){err(res,e.message,500);}});
app.post('/api/users', async (req, res) => { try { const{id,name,role,email,div,password}=req.body; if(!id||!name||!role||!email||!div||!password)return err(res,'必須項目が不足しています'); await pool.query('INSERT INTO users(id,name,role,email,div,password) VALUES($1,$2,$3,$4,$5,$6)',[id,name,role,email,div,password]); ok(res,(await pool.query('SELECT * FROM users WHERE active=1 ORDER BY id')).rows); }catch(e){err(res,e.message,500);}});
app.put('/api/users/:id', async (req, res) => { try { const{name,role,email,div,password}=req.body; const c=(await pool.query('SELECT * FROM users WHERE id=$1',[req.params.id])).rows[0]; if(!c)return err(res,'ユーザーが見つかりません',404); await pool.query("UPDATE users SET name=$1,role=$2,email=$3,div=$4,password=$5,updated_at=NOW() WHERE id=$6",[name||c.name,role||c.role,email||c.email,div||c.div,password||c.password,req.params.id]); ok(res,(await pool.query('SELECT * FROM users WHERE active=1 ORDER BY id')).rows); }catch(e){err(res,e.message,500);}});
app.delete('/api/users/:id', async (req, res) => { try { await pool.query('UPDATE users SET active=0 WHERE id=$1',[req.params.id]); ok(res,(await pool.query('SELECT * FROM users WHERE active=1 ORDER BY id')).rows); }catch(e){err(res,e.message,500);}});
app.post('/api/login', async (req, res) => { try { const{email,password}=req.body; const user=(await pool.query('SELECT * FROM users WHERE email=$1 AND active=1',[email])).rows[0]; if(!user)return err(res,'メールアドレスが見つかりません',401); if(user.password!==password)return err(res,'パスワードが正しくありません',401); const{password:_,...safeUser}=user; ok(res,safeUser); }catch(e){err(res,e.message,500);}});
app.get('/api/next-job-number', async (req, res) => { try { const{div}=req.query; const p=div==='hp'?'#3':'#2'; const r=(await pool.query("SELECT job_number FROM jobs WHERE job_number LIKE $1 ORDER BY job_number DESC LIMIT 1",[p+'%'])).rows[0]; let n=p==='#2'?'#20001':'#30001'; if(r){const x=parseInt(r.job_number.replace('#',''),10);n=`#${x+1}`;} ok(res,{jobNumber:n}); }catch(e){err(res,e.message,500);}});

// ============================================================
// 事業部・センターAPI（新設）
// ============================================================
app.get('/api/divisions', async (req, res) => {
  try {
    ok(res, (await pool.query('SELECT * FROM divisions ORDER BY sort_order')).rows);
  } catch(e) { err(res, e.message, 500); }
});

app.get('/api/centers', async (req, res) => {
  try {
    const { division_id } = req.query;
    let sql = 'SELECT * FROM centers';
    const params = [];
    if (division_id) { sql += ' WHERE division_id=$1'; params.push(division_id); }
    sql += ' ORDER BY sort_order';
    ok(res, (await pool.query(sql, params)).rows);
  } catch(e) { err(res, e.message, 500); }
});

// SPA fallback
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🔧 Ams PRO v6.0 サーバー起動（PostgreSQL + Cloud Run対応）');
  console.log(`   ポート: ${PORT}`);
  console.log('');
});
