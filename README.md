# travelog-for-web
# travelog-for-web

## AI planner

文章や画像から旅行プランの下書きを生成するには、`.env.local` に以下を設定してください。

```bash
OPENAI_API_KEY=your_openai_api_key
# 任意。未指定時は gpt-4.1 を使います
OPENAI_PLANNER_MODEL=gpt-4.1

# ホテル候補取得（Google Hotels via SerpApi）
SERPAPI_API_KEY=your_serpapi_key
```

開発時に `.next/server/vendor-chunks/...` の module not found が出る場合は、`npm run dev` を再起動してください。`dev` スクリプトは起動前に `.next` を掃除するようにしてあります。
