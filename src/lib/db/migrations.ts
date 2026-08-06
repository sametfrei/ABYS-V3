/**
 * Sıralı şema migration'ları. Kural: yayınlanmış migration DEĞİŞTİRİLMEZ,
 * yeni değişiklik yeni migration olarak eklenir. Tüm iş varlıkları org_id
 * taşır (kurum izolasyonu). Tam varlık listesi: docs/DATA_MODEL.md.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "cekirdek: organizasyon, kullanici, oturum, denetim",
    sql: `
      CREATE TABLE organizations (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        sector_id  TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        org_id        TEXT NOT NULL REFERENCES organizations(id),
        email         TEXT NOT NULL UNIQUE,
        display_name  TEXT NOT NULL,
        role          TEXT NOT NULL, -- board|ceo|clevel|dept_manager|risk_manager|analyst|auditor|data_admin|sys_admin
        password_hash TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active', -- active|disabled
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX users_org ON users(org_id);

      CREATE TABLE sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id),
        org_id     TEXT NOT NULL REFERENCES organizations(id),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX sessions_user ON sessions(user_id);

      CREATE TABLE audit_events (
        id         TEXT PRIMARY KEY,
        org_id     TEXT NOT NULL REFERENCES organizations(id),
        actor      TEXT NOT NULL,
        type       TEXT NOT NULL,
        summary    TEXT NOT NULL,
        detail     TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX audit_org_time ON audit_events(org_id, created_at DESC);
    `,
  },
  {
    id: 2,
    name: "karar varliklari: vakalar ve karar kayitlari",
    sql: `
      -- Vaka icerigi JSONB'de tutulur (kanit zinciri, secenekler, karsi senaryo
      -- yapisi hala evrimlesiyor); sorgulanan alanlar kolon olarak acildi.
      CREATE TABLE decision_cases (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        sector_id   TEXT NOT NULL,
        category_id TEXT NOT NULL,
        severity    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open', -- open|decided
        title       TEXT NOT NULL,
        confidence  INTEGER NOT NULL,
        payload     JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX cases_org_sector ON decision_cases(org_id, sector_id, status);

      CREATE TABLE decision_records (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        case_id      TEXT NOT NULL REFERENCES decision_cases(id),
        sector_id    TEXT NOT NULL,
        choice       TEXT NOT NULL, -- accepted|rejected|modified
        decided_by   TEXT NOT NULL,
        payload      JSONB NOT NULL,
        outcome      JSONB,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX records_org_sector ON decision_records(org_id, sector_id, created_at DESC);
    `,
  },
  {
    id: 3,
    name: "veri katmani: veri setleri, kpi degerleri, sinyaller",
    sql: `
      CREATE TABLE datasets (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        sector_id    TEXT NOT NULL,
        source_label TEXT NOT NULL,      -- dosya adi / kaynak etiketi
        raw_content  TEXT NOT NULL,      -- ham girdi korunur (veri soyu)
        ingested_by  TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX datasets_org ON datasets(org_id, sector_id, created_at DESC);

      CREATE TABLE kpi_values (
        id         TEXT PRIMARY KEY,
        org_id     TEXT NOT NULL REFERENCES organizations(id),
        dataset_id TEXT NOT NULL REFERENCES datasets(id),
        label      TEXT NOT NULL,
        value      TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX kpi_org_label ON kpi_values(org_id, label, created_at DESC);

      CREATE TABLE signals (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        sector_id   TEXT NOT NULL,
        dataset_id  TEXT REFERENCES datasets(id), -- hangi veriden dogdu (soy)
        category_id TEXT NOT NULL,
        severity    TEXT NOT NULL,
        title       TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open',
        payload     JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX signals_org ON signals(org_id, sector_id, status);
    `,
  },
  {
    id: 4,
    name: "yurutme katmani: aksiyonlar, sonuclar, dersler",
    sql: `
      -- Karar -> hesap verebilir aksiyon. Her aksiyon kararina baglidir
      -- (ABYS genel gorev yoneticisi degildir; koken zinciri korunur).
      CREATE TABLE actions (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        decision_id  TEXT NOT NULL REFERENCES decision_records(id),
        case_id      TEXT NOT NULL REFERENCES decision_cases(id),
        title        TEXT NOT NULL,
        owner        TEXT NOT NULL,
        due_at       TIMESTAMPTZ,
        status       TEXT NOT NULL DEFAULT 'open', -- open|in_progress|done|cancelled
        progress_note TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX actions_org ON actions(org_id, status);

      -- Gerceklesen sonuc: beklenen ile kiyas, kurumsal ders
      CREATE TABLE outcomes (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        decision_id TEXT NOT NULL REFERENCES decision_records(id),
        result      TEXT NOT NULL, -- improved|unchanged|worsened
        note        TEXT NOT NULL,
        lesson      TEXT,          -- kurumsal hafizaya gececek ders
        recorded_by TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX outcomes_org ON outcomes(org_id, created_at DESC);
    `,
  },
  {
    id: 5,
    name: "model calisma kaydi: her AI kosusunun izi",
    sql: `
      -- Her AI koşusu izlenir (master plan md.19): hangi sağlayıcı/model üretti,
      -- ne kadar sürdü, çıktı doğrulamadan geçti mi. İzlenebilirlik + benchmark.
      CREATE TABLE model_runs (
        id            TEXT PRIMARY KEY,
        org_id        TEXT NOT NULL REFERENCES organizations(id),
        task_type     TEXT NOT NULL,   -- decision_cases | risk_assessment | briefing | extract
        provider      TEXT NOT NULL,   -- ollama | gemini | deterministic
        model         TEXT,
        policy        TEXT,            -- LOCAL_ONLY | CLOUD_ALLOWED | CLOUD_ONLY
        latency_ms    INTEGER,
        output_valid  BOOLEAN,
        result_count  INTEGER,
        actor         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX model_runs_org ON model_runs(org_id, task_type, created_at DESC);
    `,
  },
  {
    id: 6,
    name: "kurumsal hafiza: belgeler ve parcalar (RAG temeli)",
    sql: `
      CREATE TABLE documents (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        title        TEXT NOT NULL,
        source_type  TEXT NOT NULL,          -- txt | md | csv | policy | report
        mime         TEXT,
        byte_size    INTEGER,
        uploaded_by  TEXT NOT NULL,
        -- Yetki-farkindalikli erisim: hangi roller okuyabilir (bos = tum roller)
        allowed_roles TEXT[],
        version      INTEGER NOT NULL DEFAULT 1,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX documents_org ON documents(org_id, created_at DESC);

      -- Parcalar: atif verilebilir en kucuk birim (belge + sira + metin).
      -- embedding kolonu simdilik NULL; semantik erisim eklendiginde doldurulur
      -- (arayuz ayni kalir, yalnizca siralama degisir).
      CREATE TABLE document_chunks (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        text        TEXT NOT NULL,
        embedding   TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX chunks_doc ON document_chunks(document_id, chunk_index);
      CREATE INDEX chunks_org ON document_chunks(org_id);
    `,
  },
  {
    id: 7,
    name: "senaryo laboratuvari: kaydedilen senaryolar",
    sql: `
      CREATE TABLE scenarios (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        sector_id    TEXT NOT NULL,
        template_id  TEXT NOT NULL,
        name         TEXT NOT NULL,
        inputs       JSONB NOT NULL,   -- kullanici degiskenleri
        results      JSONB NOT NULL,   -- deterministik hesap ciktisi (taban/iyimser/kotumser)
        formula_text TEXT NOT NULL,    -- kullanilan formul (izlenebilirlik)
        created_by   TEXT NOT NULL,
        case_id      TEXT REFERENCES decision_cases(id), -- Karar Merkezi'ne baglanti
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX scenarios_org ON scenarios(org_id, created_at DESC);
    `,
  },
  {
    id: 8,
    name: "entegrasyon: webhook sirlari ve teslimat kayitlari",
    sql: `
      -- Kurum basina webhook sirri (HMAC imza dogrulamasi icin)
      CREATE TABLE webhook_secrets (
        org_id     TEXT PRIMARY KEY REFERENCES organizations(id),
        secret     TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        rotated_at TIMESTAMPTZ
      );

      -- Teslimat kaydi: idempotency (ayni anahtar iki kez islenmez) +
      -- replay korumasi + hiz siniri sayimi icin zaman damgali kayit.
      CREATE TABLE webhook_deliveries (
        id              TEXT PRIMARY KEY,
        org_id          TEXT NOT NULL REFERENCES organizations(id),
        idempotency_key TEXT NOT NULL,
        signature       TEXT NOT NULL,
        payload_size    INTEGER NOT NULL,
        accepted        BOOLEAN NOT NULL,
        reason          TEXT,
        dataset_id      TEXT REFERENCES datasets(id),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX webhook_idem ON webhook_deliveries(org_id, idempotency_key);
      CREATE INDEX webhook_org_time ON webhook_deliveries(org_id, created_at DESC);
    `,
  },
  {
    id: 9,
    name: "integration gateway: api anahtarlari ve olay akisi",
    sql: `
      -- Makine-makine erisim icin API anahtari (portal -> ABYS).
      -- Anahtarin kendisi HASH'lenerek saklanir; duz metin yalnizca uretimde
      -- bir kez gosterilir (parola gibi).
      CREATE TABLE api_keys (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        name        TEXT NOT NULL,
        key_hash    TEXT NOT NULL,
        key_prefix  TEXT NOT NULL,          -- gosterim icin ilk 8 karakter
        scopes      TEXT[] NOT NULL,        -- events:write | read:advisors | read:all
        last_used_at TIMESTAMPTZ,
        revoked_at  TIMESTAMPTZ,
        created_by  TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX api_keys_org ON api_keys(org_id) WHERE revoked_at IS NULL;
      CREATE UNIQUE INDEX api_keys_hash ON api_keys(key_hash);

      -- Portal olaylari. Ham olay KORUNUR (veri soyu); metrikler bundan
      -- deterministik olarak turetilir.
      CREATE TABLE integration_events (
        id            TEXT PRIMARY KEY,
        org_id        TEXT NOT NULL REFERENCES organizations(id),
        event_type    TEXT NOT NULL,        -- lead.updated, call.completed, session.started...
        actor_ref     TEXT,                 -- danisman kimligi (portal id'si)
        subject_ref   TEXT,                 -- lead/customer/sale id'si
        occurred_at   TIMESTAMPTZ NOT NULL, -- portalin bildirdigi zaman
        received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        payload       JSONB NOT NULL,
        source        TEXT NOT NULL,        -- portal adi
        batch_id      TEXT,                 -- toplu gonderim izi
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX events_org_time ON integration_events(org_id, occurred_at DESC);
      CREATE INDEX events_org_actor ON integration_events(org_id, actor_ref, occurred_at DESC);
      CREATE INDEX events_org_type ON integration_events(org_id, event_type, occurred_at DESC);
      -- Idempotency: ayni olay iki kez islenmez
      CREATE UNIQUE INDEX events_dedup ON integration_events(org_id, source, id);
    `,
  },
  {
    id: 10,
    name: "kok neden zinciri: neden-sonuc baglantilari",
    sql: `
      -- Korelasyon asla kanitlanmis nedensellik olarak sunulmaz; varsayilan
      -- durum 'observed_correlation'dir ve yalnizca insan onayiyla ilerler.
      CREATE TABLE causal_links (
        id              TEXT PRIMARY KEY,
        org_id          TEXT NOT NULL REFERENCES organizations(id),
        case_id         TEXT NOT NULL REFERENCES decision_cases(id),
        from_label      TEXT NOT NULL,
        to_label        TEXT NOT NULL,
        relation_status TEXT NOT NULL DEFAULT 'observed_correlation', -- observed_correlation|inferred|expert_confirmed|data_confirmed|disputed
        confidence      INTEGER NOT NULL,
        note            TEXT,
        created_by      TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX causal_links_org_case ON causal_links(org_id, case_id);
    `,
  },
  {
    id: 11,
    name: "kpi kayit defteri: kpi tanimlari ve esikleri",
    sql: `
      -- KPI sozluk kaydi: her metrigin sahibi, formulu ve alarm esikleri.
      -- Esik karsilastirmasi dilbilim modeline birakilmaz, kodda yapilir
      -- (bkz. evaluateAgainstThresholds).
      CREATE TABLE kpi_definitions (
        id                 TEXT PRIMARY KEY,
        org_id             TEXT NOT NULL REFERENCES organizations(id),
        name               TEXT NOT NULL,
        description        TEXT,
        unit               TEXT,
        formula_text       TEXT,
        owner              TEXT,
        department         TEXT,
        target             NUMERIC,
        warn_threshold     NUMERIC,
        critical_threshold NUMERIC,
        update_frequency   TEXT,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX kpi_definitions_org ON kpi_definitions(org_id);
      CREATE UNIQUE INDEX kpi_definitions_org_name ON kpi_definitions(org_id, name);
    `,
  },
  {
    id: 12,
    name: "karar durumlari: yasam dongusu alanlari",
    sql: `
      -- Karar tek adimda 'approved' olmakla kalmaz; onay/yurutme/sonuc
      -- inceleme dongusunden gecer. Varsayilan 'approved' ile mevcut
      -- davranis (POST /api/decisions) bozulmaz.
      ALTER TABLE decision_records ADD COLUMN state TEXT NOT NULL DEFAULT 'approved';
      ALTER TABLE decision_records ADD COLUMN review_date TIMESTAMPTZ;
      ALTER TABLE decision_records ADD COLUMN expected_outcome TEXT;
      ALTER TABLE decision_records ADD COLUMN risks_of_acting TEXT;
      ALTER TABLE decision_records ADD COLUMN risks_of_not_acting TEXT;
    `,
  },
  {
    id: 13,
    name: "denetim gunlugu: kurcalamaya-karsi hash zinciri",
    sql: `
      -- Zincir alanlari eski satirlarda NULL kalir (zincir-oncesi kayit
      -- sayilir, bkz. verifyAuditChain). Yeni yazimlar prev_hash'i ayni
      -- organizasyonun son kaydindan alir, entry_hash sha256 ile hesaplanir.
      ALTER TABLE audit_events ADD COLUMN prev_hash TEXT;
      ALTER TABLE audit_events ADD COLUMN entry_hash TEXT;
    `,
  },
  {
    id: 14,
    name: "entegrasyon olaylari: kimlik modeli duzeltmesi",
    sql: `
      -- Eski semada portalin gonderdigi id dogrudan PK'ydi; iki FARKLI kurumun
      -- portali ayni harici id'yi (orn. "evt_1001") gonderirse ikincisi
      -- reddediliyordu. Artik dahili id sunucuda uretilir, portal kimligi
      -- external_event_id'de tutulur ve tekillik (org_id, source,
      -- external_event_id) uzerinden saglanir. NULL degerler standart SQL
      -- benzersizlik semantiginde birbirine esit sayilmadigindan, portal id
      -- gondermeyen olaylar dogal olarak tekillik kontrolunden muaf kalir.
      ALTER TABLE integration_events ADD COLUMN external_event_id TEXT;
      UPDATE integration_events SET external_event_id = id;
      DROP INDEX events_dedup;
      CREATE UNIQUE INDEX events_dedup ON integration_events(org_id, source, external_event_id);
    `,
  },
  {
    id: 15,
    name: "entegrasyon olaylari: sozlesme sertlestirme (session_ref, schema_version)",
    sql: `
      -- Portal, olaylari bir oturuma (session.started/ended disinda da) baglamak
      -- icin isteğe bagli session_ref gonderebilir; schema_version ileride
      -- sozlesme degisirse geriye donuk uyumlulugu ayirt etmek icindir.
      ALTER TABLE integration_events ADD COLUMN session_ref TEXT;
      ALTER TABLE integration_events ADD COLUMN schema_version TEXT;
    `,
  },
  {
    id: 16,
    name: "tais tesis yonetimi demo: kurum kodu + Bitrix24-esleme varliklari",
    sql: `
      -- Idempotent seed kontrolu icin kurum kodu (yalnizca kod atanan kurumlarda
      -- tekillik zorunlu; mevcut demo kurumu kod'suz kalmaya devam eder).
      ALTER TABLE organizations ADD COLUMN code TEXT;
      CREATE UNIQUE INDEX organizations_code ON organizations(code) WHERE code IS NOT NULL;

      -- Asagidaki tais_* tablolari TAIS IKF MMC demosunun Bitrix24 nesnelerine
      -- eslenecek is varliklarini tutar (Company/Deal/Task/Activity/User/
      -- Department/Smart Process). Tumu org-farkindalikli.
      CREATE TABLE tais_customers (
        id                 TEXT PRIMARY KEY,
        org_id             TEXT NOT NULL REFERENCES organizations(id),
        name               TEXT NOT NULL,
        district           TEXT NOT NULL,
        bitrix_company_id  TEXT,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_customers_org ON tais_customers(org_id);

      CREATE TABLE tais_locations (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        customer_id TEXT NOT NULL REFERENCES tais_customers(id),
        name        TEXT NOT NULL,
        district    TEXT NOT NULL,
        category    TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_locations_org ON tais_locations(org_id);
      CREATE INDEX tais_locations_customer ON tais_locations(customer_id);

      CREATE TABLE tais_contracts (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        customer_id  TEXT NOT NULL REFERENCES tais_customers(id),
        category     TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'active',
        value_azn    NUMERIC NOT NULL,
        start_date   TIMESTAMPTZ NOT NULL,
        renewal_date TIMESTAMPTZ NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_contracts_org ON tais_contracts(org_id);
      CREATE INDEX tais_contracts_customer ON tais_contracts(customer_id);
      CREATE INDEX tais_contracts_renewal ON tais_contracts(org_id, renewal_date);

      CREATE TABLE tais_teams (
        id         TEXT PRIMARY KEY,
        org_id     TEXT NOT NULL REFERENCES organizations(id),
        name       TEXT NOT NULL,
        category   TEXT NOT NULL,
        capacity   INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_teams_org ON tais_teams(org_id);

      CREATE TABLE tais_employees (
        id         TEXT PRIMARY KEY,
        org_id     TEXT NOT NULL REFERENCES organizations(id),
        team_id    TEXT NOT NULL REFERENCES tais_teams(id),
        name       TEXT NOT NULL,
        role       TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_employees_org ON tais_employees(org_id);
      CREATE INDEX tais_employees_team ON tais_employees(team_id);

      -- employee_id NULL = sahipsiz gorev (senaryonun bir parcasi, bkz. seed.ts)
      CREATE TABLE tais_tasks (
        id           TEXT PRIMARY KEY,
        org_id       TEXT NOT NULL REFERENCES organizations(id),
        category     TEXT NOT NULL,
        team_id      TEXT NOT NULL REFERENCES tais_teams(id),
        location_id  TEXT NOT NULL REFERENCES tais_locations(id),
        customer_id  TEXT NOT NULL REFERENCES tais_customers(id),
        employee_id  TEXT REFERENCES tais_employees(id),
        title        TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'open',
        due_at       TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_tasks_org ON tais_tasks(org_id);
      CREATE INDEX tais_tasks_team ON tais_tasks(team_id, status);
      CREATE INDEX tais_tasks_due ON tais_tasks(org_id, status, due_at);

      CREATE TABLE tais_leads (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        customer_id TEXT REFERENCES tais_customers(id),
        name        TEXT NOT NULL,
        category    TEXT NOT NULL,
        stage       TEXT NOT NULL DEFAULT 'new',
        source      TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_leads_org ON tais_leads(org_id);

      CREATE TABLE tais_deals (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        customer_id TEXT NOT NULL REFERENCES tais_customers(id),
        category    TEXT NOT NULL,
        stage       TEXT NOT NULL DEFAULT 'prospecting',
        value_azn   NUMERIC NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_deals_org ON tais_deals(org_id);
      CREATE INDEX tais_deals_customer ON tais_deals(customer_id);

      CREATE TABLE tais_activities (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        customer_id TEXT NOT NULL REFERENCES tais_customers(id),
        deal_id     TEXT REFERENCES tais_deals(id),
        type        TEXT NOT NULL,
        subject     TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_activities_org ON tais_activities(org_id);
      CREATE INDEX tais_activities_customer ON tais_activities(customer_id, occurred_at DESC);

      CREATE TABLE tais_service_requests (
        id              TEXT PRIMARY KEY,
        org_id          TEXT NOT NULL REFERENCES organizations(id),
        customer_id     TEXT NOT NULL REFERENCES tais_customers(id),
        location_id     TEXT NOT NULL REFERENCES tais_locations(id),
        category        TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'open',
        matched_task_id TEXT REFERENCES tais_tasks(id),
        opened_at       TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_requests_org ON tais_service_requests(org_id, status);

      CREATE TABLE tais_complaints (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        customer_id TEXT NOT NULL REFERENCES tais_customers(id),
        location_id TEXT NOT NULL REFERENCES tais_locations(id),
        category    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open',
        opened_at   TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_complaints_org ON tais_complaints(org_id, customer_id);

      CREATE TABLE tais_quality_issues (
        id          TEXT PRIMARY KEY,
        org_id      TEXT NOT NULL REFERENCES organizations(id),
        location_id TEXT NOT NULL REFERENCES tais_locations(id),
        category    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open',
        opened_at   TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX tais_quality_org ON tais_quality_issues(org_id);
    `,
  },
  {
    id: 17,
    name: "aksiyonlar: bagli risk referansi (karar-risk-aksiyon kanit zinciri)",
    sql: `
      -- Aksiyonun hangi risk kaydina dayandigini izler (orn. TAIS demo risk
      -- motorunun urettigi TaisRisk.id). FK DEGIL: riskler ayri, kalici bir
      -- tabloda tutulmuyor, ilgili veri anlik goruntusunden deterministik
      -- olarak hesaplaniyor (bkz. src/lib/demo/tais/risks.ts). Bu alan
      -- yalnizca izlenebilirlik/kanit zinciri icin serbest metin referanstir.
      ALTER TABLE actions ADD COLUMN related_risk_id TEXT;
    `,
  },
];
