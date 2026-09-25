import { config } from 'dotenv';
config({path:'.env.local'});
async function main(){const {syncSource}=await import('../src/lib/source');console.log(await syncSource());}
main().catch(error=>{console.error(error);process.exit(1)});
