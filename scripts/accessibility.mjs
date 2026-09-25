import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('.artifacts', { recursive: true });
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
await page.goto(process.env.TEST_URL??'http://localhost:3000');await page.waitForSelector('.event-card');await page.waitForTimeout(1500);
const results=[];
for(const width of [1440,390]){
 await page.setViewportSize({width,height:1000});
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();results.push({screen:'browse',width,violations:result.violations});
}
await page.getByRole('button',{name:'Start planning'}).click();
const auth=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();results.push({screen:'signup',width:390,violations:auth.violations});
writeFileSync('.artifacts/accessibility.json',JSON.stringify(results,null,2));console.log(results.map(r=>({screen:r.screen,width:r.width,violations:r.violations.map(v=>({id:v.id,count:v.nodes.length}))})));
await context.close();await browser.close();if(results.some(r=>r.violations.length))process.exitCode=1;
