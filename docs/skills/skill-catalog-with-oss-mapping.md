# Skill 大分類/小分類細化與 GitHub 開源專案對應

> 目標：建立可擴充的 Skill 目錄，方便後續串接本地開源軟體（local-first / self-hosted）。

## 1) 大分類與小分類定義

## A. Foundation（基礎能力層）
- **定位**：所有上層 Skill 的共用能力，先建這層可降低重工。
- **小分類**
  - 文件與檔案處理（解析、轉換、路徑安全）
  - 文字前處理（清洗、切塊、語言規範化）
  - 結構化資料處理（Schema 映射、驗證）
  - 流程控制（排程、重試、回滾）
  - 觀測與審計（log/trace/metrics）

## B. Knowledge & Retrieval（知識檢索層）
- **定位**：讓系統具備可查、可引、可追溯的知識能力。
- **小分類**
  - Ingestion（來源接入）
  - Embedding / Index（向量化與索引）
  - Retrieval / Rerank（召回與排序）
  - Citation / Grounding（引用與可驗證性）
  - KB Governance（版本、權限、品質）

## C. Agentic（代理能力層）
- **定位**：把 LLM 從問答提升到任務執行。
- **小分類**
  - 任務規劃（Plan/Decompose）
  - 工具調用（Tool Use）
  - 記憶管理（Short/Long-term）
  - 多代理協作（Orchestration）
  - 安全/策略守門（Policy Guardrail）

## D. Application（場景應用層）
- **定位**：面向具體業務流程的可交付 Skill。
- **小分類**
  - 內容生產（寫作、摘要、改寫）
  - 資料分析（報表、洞察）
  - 工程生產力（代碼、測試、修復）
  - 客服/工單（分類、回覆、升級）
  - 營運自動化（SOP、通知、巡檢）

## E. Integration（本地開源整合層）
- **定位**：把 Skill 穩定接上本地 OSS，支援內網部署。
- **小分類**
  - 本地模型服務（推論）
  - 向量庫與搜尋
  - 資料庫/訊息佇列
  - IAM/SSO
  - 容器化與維運

---

## 2) 詳細 Skill 列表（含對應 GitHub OSS）

> 命名以 kebab-case；每個 Skill 先給 1–3 個主推 OSS。

| Skill | 分類 | 功能摘要 | 優先對應 GitHub 開源專案 |
|---|---|---|---|
| `file-intake-router` | Foundation | 來源檔案分類與路徑路由 | Apache Tika, rclone |
| `document-parser` | Foundation | PDF/DOCX/HTML 解析 | Unstructured-IO/unstructured, Apache Tika |
| `ocr-pipeline` | Foundation | 掃描件 OCR 與版面還原 | tesseract-ocr/tesseract, PaddlePaddle/PaddleOCR |
| `text-normalizer` | Foundation | 文字清洗與標準化 | explosion/spaCy, huggingface/tokenizers |
| `schema-mapper` | Foundation | 欄位映射/型別轉換 | dbt-labs/dbt-core, frictionlessdata/frictionless-py |
| `workflow-orchestrator` | Foundation | 任務編排與重試 | n8n-io/n8n, prefecthq/prefect, apache/airflow |
| `run-observability` | Foundation | Trace/metrics/log 統一觀測 | open-telemetry/opentelemetry-collector, grafana/loki |
| `sandbox-fs-guard` | Foundation | 本地檔案沙箱與 ACL | AppArmor, open-policy-agent/opa |
| `knowledge-ingestion` | Knowledge | 文件批量匯入與去重 | Unstructured-IO/unstructured, langchain-ai/langchain |
| `chunking-strategy-manager` | Knowledge | 分塊策略管理 | run-llama/llama_index, langchain-ai/langchain |
| `embedding-manager` | Knowledge | Embedding 模型切換與版本 | ollama/ollama, UKPLab/sentence-transformers |
| `vector-index-maintainer` | Knowledge | 向量索引建立/壓縮/重建 | qdrant/qdrant, milvus-io/milvus, chroma-core/chroma |
| `hybrid-retriever` | Knowledge | BM25 + Dense 混合檢索 | opensearch-project/OpenSearch, elastic/elasticsearch |
| `rerank-service` | Knowledge | 召回結果重排序 | castorini/pyserini, UKPLab/sentence-transformers |
| `citation-builder` | Knowledge | 回答引用與來源追溯 | deepset-ai/haystack |
| `rag-answer-composer` | Knowledge | 具引用的 RAG 回答生成 | run-llama/llama_index, langchain-ai/langchain |
| `task-planner` | Agentic | 任務拆解與執行計畫 | microsoft/autogen, crewAIInc/crewAI |
| `tool-call-agent` | Agentic | 工具調用代理 | langchain-ai/langgraph, microsoft/semantic-kernel |
| `memory-controller` | Agentic | 會話/長期記憶治理 | mem0ai/mem0, run-llama/llama_index |
| `multi-agent-coordinator` | Agentic | 多代理角色協調 | microsoft/autogen, crewAIInc/crewAI |
| `policy-guard` | Agentic | 安全策略、敏感操作閘門 | open-policy-agent/opa, guardrails-ai/guardrails |
| `self-check-agent` | Agentic | 輸出自檢與反思 | langchain-ai/langgraph |
| `fallback-strategy-agent` | Agentic | 失敗降級（模型/工具） | litellm/litellm |
| `human-handoff-agent` | Agentic | 人工接手與審批節點 | n8n-io/n8n, open-webui/open-webui |
| `content-writer-pro` | Application | 多風格內容生成 | open-webui/open-webui |
| `report-analyst` | Application | 報告自動化與視覺化輸出 | jupyter/notebook, apache/superset |
| `code-assistant-local` | Application | 本地代碼助理工作流 | continue-revolution/continue, VoidEditor/void |
| `test-case-generator` | Application | 測試案例/資料生成 | pytest-dev/pytest, vitest-dev/vitest |
| `ticket-triage-bot` | Application | 工單分類與優先級 | RasaHQ/rasa, appsmithorg/appsmith |
| `support-reply-drafter` | Application | 客服回覆草稿與語氣控制 | RasaHQ/rasa |
| `ops-sop-runner` | Application | SOP 自動化執行 | n8n-io/n8n, StackStorm/st2 |
| `notification-dispatcher` | Application | 通知路由（Slack/Email/Webhook） | gotify/server, matrix-org/synapse |
| `local-llm-adapter` | Integration | 串接本地 LLM 推論 | ollama/ollama, vllm-project/vllm, ggml-org/llama.cpp |
| `vector-db-adapter` | Integration | 串接向量資料庫 | qdrant/qdrant, milvus-io/milvus, chroma-core/chroma |
| `search-adapter` | Integration | 串接全文檢索 | opensearch-project/OpenSearch, meilisearch/meilisearch |
| `data-backend-adapter` | Integration | 串接交易/快取/物件儲存 | postgres/postgres, redis/redis, minio/minio |
| `auth-integration-adapter` | Integration | SSO/OIDC/RBAC | keycloak/keycloak, authelia/authelia |
| `queue-integration-adapter` | Integration | 事件流與工作佇列 | rabbitmq/rabbitmq-server, nats-io/nats-server, apache/kafka |
| `deployment-operator` | Integration | 本地部署與升級策略 | docker/compose, kubernetes/kubernetes, argoproj/argo-cd |

---

## 3) 建議優先串接組合（本地開源）

### 組合 A：最小可用 RAG（低門檻）
- `local-llm-adapter`: Ollama
- `vector-db-adapter`: Qdrant
- `knowledge-ingestion`: Unstructured
- `hybrid-retriever`: OpenSearch
- `rag-answer-composer`: LlamaIndex

### 組合 B：高吞吐推論（效能導向）
- `local-llm-adapter`: vLLM
- `vector-db-adapter`: Milvus
- `workflow-orchestrator`: Prefect
- `run-observability`: OpenTelemetry + Loki/Grafana

### 組合 C：內網合規（治理導向）
- `auth-integration-adapter`: Keycloak
- `policy-guard`: OPA
- `deployment-operator`: Kubernetes + Argo CD

---

## 4) 實作建議（下一步）

1. 先落地 10 個 MVP Skills：
   - `document-parser`, `knowledge-ingestion`, `embedding-manager`, `vector-index-maintainer`, `hybrid-retriever`, `rag-answer-composer`, `tool-call-agent`, `policy-guard`, `local-llm-adapter`, `vector-db-adapter`
2. 每個 Skill 建立一致模板：
   - 目標、輸入/輸出、依賴 OSS、錯誤碼、dry-run/confirm、觀測指標
3. 先固定一套 reference stack（例如 Ollama + Qdrant + OpenSearch + n8n + Keycloak）
4. 再逐步擴充替代後端（vLLM/Milvus/Kafka）


## 5) 本地開源軟體對照矩陣（選型版）

| 能力域 | 方案 A（易上手） | 方案 B（高效能） | 方案 C（企業治理） | 主要取捨 |
|---|---|---|---|---|
| LLM 推論 | Ollama | vLLM | llama.cpp | Ollama 部署最簡；vLLM 吞吐佳；llama.cpp 資源需求低 |
| Embedding | sentence-transformers | bge 系列（HF） | Jina Embeddings（自託管） | 模型大小、語言覆蓋、延遲需平衡 |
| 向量資料庫 | Qdrant | Milvus | Weaviate | Qdrant 好維運；Milvus 適合大規模；Weaviate 功能完整 |
| 全文檢索 | Meilisearch | OpenSearch | Elasticsearch | Meili 輕量；OpenSearch 生態完整；ES 企業工具多 |
| 文件解析/OCR | Unstructured + Tesseract | Tika + PaddleOCR | Haystack converters | 文件型態覆蓋率 vs 管線複雜度 |
| Agent Framework | LangGraph | AutoGen | Semantic Kernel | LangGraph 可控；AutoGen 多代理方便；SK 偏企業整合 |
| 工作流編排 | n8n | Prefect | Airflow | n8n 低門檻；Prefect 開發友好；Airflow 批處理成熟 |
| 身分驗證/權限 | Authelia | Keycloak | Ory Kratos + Keto | Keycloak 功能廣；Authelia 輕量；Ory 可細粒度授權 |
| 訊息佇列/事件 | NATS | RabbitMQ | Kafka | NATS 延遲低；RabbitMQ 易用；Kafka 適合大量事件流 |
| 可觀測性 | Prometheus + Grafana | OpenTelemetry + Loki + Tempo | ELK Stack | OTel 可統一 trace；ELK 查詢強但成本較高 |
| 物件儲存 | MinIO | Ceph | SeaweedFS | MinIO 最易落地；Ceph 可擴展強；SeaweedFS 輕快 |
| 部署與交付 | Docker Compose | Kubernetes | K3s + Argo CD | Compose 快速驗證；K8s 標準化；K3s 適合邊緣/小集群 |

### 建議預設組合（可直接當第一版 baseline）
- **MVP（2 週可落地）**：Ollama + Qdrant + OpenSearch + Unstructured + n8n + Keycloak + MinIO
- **Scale（成長期）**：vLLM + Milvus + OpenSearch + Prefect + OTel + Kafka + Kubernetes
- **Edge/低資源**：llama.cpp + Qdrant + Meilisearch + Tesseract + NATS + K3s

