export interface LdbArchitectureSnapshot {
    engine: "lancedb";
    retrieval_layers: string[];
    rerank_layers: number;
    supports: {
        vector_search: boolean;
        bm25: boolean;
        hybrid_search: boolean;
        mmr: boolean;
        adaptive_noise_filter: boolean;
        scope_isolation: boolean;
        external_markdown_sync: boolean;
        self_evolution_learning: boolean;
    };
    embedding_providers: string[];
    plugin_mode: "hot-swappable";
    storage: {
        lancedb_uri: string;
        markdown_log_path: string;
    };
    endpoints: string[];
    rulebook: {
        auto_capture_enabled: boolean;
        confirmed_only_write: boolean;
        pitfall_first: boolean;
    };
}
export function getLdbArchitectureSnapshot(): string {
    const providers = (process.env.MEMORY_EMBEDDING_PROVIDERS ?? "openai,jinaai,gemini,ollama")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    return String({
        engine: "lancedb",
        retrieval_layers: [
            "vector-search",
            "bm25-fulltext",
            "hybrid-fusion",
            "multi-stage-rerank",
            "mmr-diversity",
            "adaptive-noise-filter",
            "scope-isolation",
        ],
        rerank_layers: 6,
        supports: {
            vector_search: true,
            bm25: true,
            hybrid_search: true,
            mmr: true,
            adaptive_noise_filter: true,
            scope_isolation: true,
            external_markdown_sync: true,
            self_evolution_learning: true,
        },
        embedding_providers: providers,
        plugin_mode: "hot-swappable",
        storage: {
            lancedb_uri: "gateway/data/lancedb",
            markdown_log_path: "memory/recent/agent-learning.md",
        },
        endpoints: [
            "GET /api/memory/architecture",
            "POST /api/memory/learn",
            "GET /api/memory/search",
            "GET /api/memory/files",
            "GET /api/memory/file",
            "GET /api/memory/workflows",
            "POST /api/memory/workflows/run",
            "GET /api/agent/messages",
            "POST /api/agent/messages",
        ],
        rulebook: {
            auto_capture_enabled: true,
            confirmed_only_write: true,
            pitfall_first: true,
        },
    });
}
