import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { refreshPublicAbout } = await import("../src/lib/linked-about");
  console.log(
    JSON.stringify(
      await refreshPublicAbout({ force: true, budgetMs: 120_000 }),
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
