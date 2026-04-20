const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = "thiagoxorlando";
const OLD_REPO = "ucastanet";
const NEW_NAME = "brisa-digital";
const NEW_DESC = "Brisa Digital - Sistema para gerenciar staff, eventos, contratos e pagamentos";

if (!TOKEN) {
  throw new Error("Missing GITHUB_TOKEN environment variable.");
}

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  }

  return json;
}

console.log("Checking current repo...");
const repo = await gh("GET", `/repos/${OWNER}/${OLD_REPO}`);
console.log(`  Current: ${repo.full_name} - "${repo.description || "(no description)"}"`);

console.log("\nRenaming repo to brisa-digital...");
const updated = await gh("PATCH", `/repos/${OWNER}/${OLD_REPO}`, {
  name: NEW_NAME,
  description: NEW_DESC,
  homepage: "",
  private: repo.private,
});

console.log(`  OK Renamed to: ${updated.full_name}`);
console.log(`  OK Description: ${updated.description}`);
console.log(`  OK URL: ${updated.html_url}`);
