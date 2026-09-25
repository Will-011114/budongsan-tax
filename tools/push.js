// 사용법: node tools/push.js "커밋 메시지"
// 폴더의 파일을 GitHub(main)에 한 번의 커밋으로 올린다. 바뀐 파일만 반영, 없으면 아무것도 안 함.
// 토큰: 환경변수 GITHUB_TOKEN 또는 ../.budongsan-github-token
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const OWNER = "Will-011114", REPO = "budongsan-tax", BRANCH = "main";
const ROOT = path.resolve(__dirname, "..");
const TOKEN = process.env.GITHUB_TOKEN || fs.readFileSync(path.join(ROOT, "..", ".budongsan-github-token"), "utf8").trim();
const msg = process.argv[2] || "업데이트";
const SKIP = new Set([".git", ".DS_Store", "node_modules"]);
const api = async (m, p, body) => {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${p}`, { method: m, headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); const j = t ? JSON.parse(t) : {};
  if (!r.ok) { const e = new Error(`${m} ${p} → ${r.status} ${j.message || ""}`); e.status = r.status; throw e; }
  return j;
};
const walk = (dir, out = []) => { for (const f of fs.readdirSync(dir)) { if (SKIP.has(f) || f.endsWith(".token")) continue; const p = path.join(dir, f); fs.statSync(p).isDirectory() ? walk(p, out) : out.push(path.relative(ROOT, p).split(path.sep).join("/")); } return out; };
const blobSha = buf => crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest("hex");
(async () => {
  const files = walk(ROOT);
  let head;
  try { head = (await api("GET", `/git/ref/heads/${BRANCH}`)).object.sha; }
  catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
    // 빈 저장소: 첫 파일 하나로 브랜치 생성
    await api("PUT", `/contents/README.md`, { message: "init", content: fs.readFileSync(path.join(ROOT, "README.md")).toString("base64"), branch: BRANCH });
    head = (await api("GET", `/git/ref/heads/${BRANCH}`)).object.sha;
  }
  const baseTree = (await api("GET", `/git/commits/${head}`)).tree.sha;
  const remote = new Map((await api("GET", `/git/trees/${baseTree}?recursive=1`)).tree.filter(x => x.type === "blob").map(x => [x.path, x.sha]));
  const tree = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(ROOT, f));
    if (remote.get(f) === blobSha(buf)) continue;
    const b = await api("POST", `/git/blobs`, { content: buf.toString("base64"), encoding: "base64" });
    tree.push({ path: f, mode: "100644", type: "blob", sha: b.sha });
  }
  for (const f of remote.keys()) if (!files.includes(f)) tree.push({ path: f, mode: "100644", type: "blob", sha: null });
  if (!tree.length) { console.log("변경 없음 — 커밋 안 함"); return; }
  const t = await api("POST", `/git/trees`, { base_tree: baseTree, tree });
  const c = await api("POST", `/git/commits`, { message: msg, tree: t.sha, parents: [head] });
  await api("PATCH", `/git/refs/heads/${BRANCH}`, { sha: c.sha });
  console.log(`커밋 완료 (${tree.length}개 파일): https://github.com/${OWNER}/${REPO}/commit/${c.sha}`);
})().catch(e => { console.error("실패:", e.message); process.exit(1); });
