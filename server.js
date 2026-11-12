// =====================================================
// My Closet Search 用の小さなサーバー
//  - index.html を http://localhost:3000 で表示する
//  - /api/images?q=検索ワード で Brave の画像検索を代わりに呼ぶ
//    （APIキーをブラウザ側に見せないため、ここで呼ぶ）
// 起動：ターミナルで  node server.js
// =====================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

// ===== .env ファイルから APIキーを読み込む =====
try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch (e) {
  console.error("⚠ .env ファイルが見つかりません。.env.example をコピーして .env を作ってください。");
  process.exit(1);
}

const API_KEY = process.env.BRAVE_API_KEY;
if (!API_KEY || API_KEY === "ここにAPIキーを貼る") {
  console.error("⚠ .env の BRAVE_API_KEY にAPIキーが入っていません。");
  process.exit(1);
}

const PORT = 3000;
const BRAVE_URL = "https://api.search.brave.com/res/v1/images/search";

// ===== 同じ検索ワードの結果を覚えておく（無料クレジットの節約） =====
// サーバーを止めると忘れる
const cache = new Map();

// ===== Brave の画像検索を呼ぶ =====
async function searchImages(query) {
  if (cache.has(query)) return cache.get(query);

  const url = `${BRAVE_URL}?q=${encodeURIComponent(query)}&count=20&safesearch=strict`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": API_KEY,
    },
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Brave API エラー ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();

  // 画面で使う項目だけに絞る
  const images = (data.results || [])
    .filter((r) => r.thumbnail && r.thumbnail.src)
    .map((r) => ({
      title: r.title || "",
      thumbnail: r.thumbnail.src, // Brave が用意している縮小画像
      pageUrl: r.url,             // 画像が載っている元のページ
      source: r.source || "",     // サイト名
    }));

  cache.set(query, images);
  return images;
}

// ===== 返事を送るための小さな関数 =====
function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

// ===== サーバー本体 =====
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // 画像検索の窓口
  if (url.pathname === "/api/images") {
    const query = (url.searchParams.get("q") || "").trim();
    if (!query) return sendJson(res, 400, { error: "検索ワードがありません" });

    try {
      const images = await searchImages(query);
      console.log(`検索: ${query} → ${images.length}件`);
      sendJson(res, 200, { images });
    } catch (e) {
      console.error(e.message);
      sendJson(res, 502, { error: "画像検索に失敗しました（ターミナルのメッセージを確認してください）" });
    }
    return;
  }

  // トップページ（index.html）
  if (url.pathname === "/" || url.pathname === "/index.html") {
    fs.readFile(path.join(__dirname, "index.html"), (err, html) => {
      if (err) {
        res.writeHead(500);
        return res.end("index.html が読めませんでした");
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// 127.0.0.1 = このPCからだけアクセスできる（他の人からは見えない）
server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ 起動しました → http://localhost:${PORT}`);
  console.log("止めるときは Ctrl + C");
});
