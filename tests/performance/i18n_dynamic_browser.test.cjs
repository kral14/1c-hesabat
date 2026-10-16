const fs=require('node:fs'),assert=require('node:assert/strict');const {chromium}=require('playwright');
setTimeout(()=>{console.error('i18n test timed out');process.exit(1);},45000).unref();
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><button id="nested"><i>⚙</i> Формирование цен</button><select id="operators"><option>Равно</option><option value="not_equal">Не равно</option></select><input id="data" value="Номенклатура"><input id="search" placeholder="Поиск по названию, коду, VÖEN..."><textarea placeholder="Все товары (или выберите конкретные)..."></textarea><table><tbody><tr><td><span id="business">Склады</span></td></tr></tbody></table><div data-i18n-skip><button id="skip">Закрыть</button></div><button id="unknown" data-i18n="missing.test.key">Закрыть</button><select id="modalUserSelect"><option value="person">Пользователь</option></select><div id="markup" data-i18n-html="unknown.html"><strong>Выбрать папку</strong></div><div id="dynamic"></div>`}));
 await page.goto('http://i18n.test');
 await page.addScriptTag({content:fs.readFileSync('static/js/c1_i18n.js','utf8')});
 assert.match(await page.locator('#nested').innerText(),/Qiymətlərin formalaşdırılması/);
 assert.equal(await page.locator('#nested i').count(),1,'icons must survive');
 assert.equal(await page.locator('#operators option').first().textContent(),'Bərabərdir');
 assert.equal(await page.locator('#operators').inputValue(),'Равно','implicit option values must remain backend-compatible');
 assert.equal(await page.locator('#business').textContent(),'Склады','business data is not interface text');
 assert.equal(await page.locator('#data').inputValue(),'Номенклатура');
 assert.equal(await page.locator('#skip').textContent(),'Закрыть');
 assert.equal(await page.locator('#unknown').textContent(),'Bağla');
 assert.equal(await page.locator('#modalUserSelect option').textContent(),'Пользователь');
 assert.equal(await page.locator('#markup strong').textContent(),'Qovluğu seç');
 assert.equal(await page.locator('textarea').getAttribute('placeholder'),'Bütün məhsullar (və ya məhsul seçin)...');
 await page.evaluate(()=>document.getElementById('dynamic').innerHTML='<button id="late" title="Выбрать папку">Загрузить цены из Excel...</button><select><option id="newop">Не заполнено</option></select>');
 await page.waitForFunction(()=>document.getElementById('late').textContent===C1I18n.translatePhrase('Загрузить цены из Excel...'));
 assert.equal(await page.locator('#late').getAttribute('title'),'Qovluğu seç');
 assert.equal(await page.locator('#newop').getAttribute('value'),'Не заполнено');
 await page.evaluate(()=>C1I18n.setLanguage('ru'));
 assert.equal(await page.locator('#late').textContent(),'Загрузить цены из Excel...');
 assert.match(await page.locator('#nested').innerText(),/Формирование цен/);
 await page.evaluate(()=>C1I18n.setLanguage('az'));
 await page.evaluate(()=>document.getElementById('late').textContent='Снять все установленные отборы');
 await page.waitForFunction(()=>document.getElementById('late').textContent==='Bütün filtrləri ləğv et');
 await page.evaluate(()=>document.getElementById('search').setAttribute('title','Начало периода'));
 await page.waitForFunction(()=>document.getElementById('search').title==='Dövrün başlanğıcı');
 const duplicateLabels=await page.evaluate(()=>[
   C1I18n.translateColumn('pogruzka_duplicate','Погрузка машины: есть дубликаты (включая удалённые)'),
   C1I18n.translateColumn('pogruzka_active_duplicate','Погрузка машины: активные дубликаты (красные)'),
   C1I18n.translatePhrase('Погрузка машины: есть дубликаты (включая удаленные)')
 ]);
 assert.ok(duplicateLabels.every(label=>!/[А-Яа-яЁё]/.test(label)),JSON.stringify(duplicateLabels));
 assert.match(duplicateLabels[0],/silinmişlər daxil/);
 assert.match(duplicateLabels[1],/aktiv dublikatlar/);
 const examples=await page.evaluate(()=>['✔ ПРОВЕДЕН','Колонки...','Склад:','Стр. 12','+3 добавлено','Журнал документов: Заказ покупателя','Всего типов цен: 12','Версия 7'].map(text=>C1I18n.translatePhrase(text)));
 assert.ok(examples.every(text=>!/[А-Яа-яЁё]/.test(text)),JSON.stringify(examples));
 assert.deepEqual(errors,[]);
 console.log('Dynamic AZ/RU translation, nested controls, attributes, option values and business-data preservation passed.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
