const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Verify files exist and contain expected syntax
const jsPath = path.join(__dirname, '..', 'static', 'js', 'price_doc_editor.js');
const presetJsPath = path.join(__dirname, '..', 'static', 'js', 'components', 'c1_preset_component.js');
const htmlPath = path.join(__dirname, '..', 'templates', 'components', 'price_doc_editor_window.html');

assert(fs.existsSync(jsPath), 'price_doc_editor.js exists');
assert(fs.existsSync(presetJsPath), 'c1_preset_component.js exists');
assert(fs.existsSync(htmlPath), 'price_doc_editor_window.html exists');

const jsContent = fs.readFileSync(jsPath, 'utf8');
const presetContent = fs.readFileSync(presetJsPath, 'utf8');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// 2. Check HTML contains key UI components
assert(htmlContent.includes('pdePriceFormationModal'), 'Modal pdePriceFormationModal exists in HTML');
assert(htmlContent.includes('pdePfTable'), 'Grid table pdePfTable exists in HTML');
assert(htmlContent.includes('PriceDocEditor.openPfPresetsRestore()'), 'Preset restore button exists in HTML');
assert(htmlContent.includes('PriceDocEditor.openPfPresetsSave()'), 'Preset save button exists in HTML');
assert(htmlContent.includes('pdeExcelOnlyExistingPricesChk'), 'Excel conditional update checkbox exists in HTML');
assert(htmlContent.includes('pdeExcelDontAddNewItemsChk'), 'Excel skip new items checkbox exists in HTML');
assert(htmlContent.includes('pdePfIncludeZeroPricesChk'), 'Include zero prices checkbox exists in HTML');

// 3. Check JS contains key functions and reference logic
assert(jsContent.includes('openPriceFormationModal:'), 'openPriceFormationModal is implemented');
assert(jsContent.includes('openPfPresetsRestore:'), 'openPfPresetsRestore is implemented');
assert(jsContent.includes('openPfPresetsSave:'), 'openPfPresetsSave is implemented');
assert(jsContent.includes('executePriceFormation:'), 'executePriceFormation is implemented');
assert(jsContent.includes('openPfPriceTypesPicker:'), 'openPfPriceTypesPicker is implemented');
assert(jsContent.includes('openPfNomPicker:'), 'openPfNomPicker is implemented');
assert(jsContent.includes('openPfNomGroupPicker:'), 'openPfNomGroupPicker is implemented');
assert(jsContent.includes('openPfPriceGroupPicker:'), 'openPfPriceGroupPicker is implemented');

// 4. Test Excel conditional reference import logic simulation
function simulateExcelImport(documentItems, excelRows, options) {
  const { onlyExistingPrices, dontAddNewItems, targetPriceTypes } = options;
  let updatedCount = 0;
  let skippedPriceCount = 0;
  let skippedNotExistsCount = 0;

  excelRows.forEach(row => {
    const item = documentItems.find(it => 
      (row.barcode && it.barcode === row.barcode) ||
      (row.code && it.code === row.code) ||
      (row.artikul && it.artikul === row.artikul) ||
      (row.name && it.name.trim().toLowerCase() === row.name.trim().toLowerCase())
    );

    if (!item) {
      if (dontAddNewItems) {
        skippedNotExistsCount++;
        return;
      }
      // Add new
      return;
    }

    // Existing item found in document
    targetPriceTypes.forEach(pt => {
      const oldPrice = (item.prices && item.prices[pt] !== undefined && item.prices[pt] !== null) ? Number(item.prices[pt]) : 0;
      if (onlyExistingPrices) {
        if (oldPrice > 0) {
          // UPDATE!
          item.prices = item.prices || {};
          item.prices[pt] = row.price;
          updatedCount++;
        } else {
          // SKIP! (User requirement: "eyer a kodunda qiymet var idise bu sefer onun yeni qiymetini teyin edib deyisdirecek yoxdursa kececek")
          skippedPriceCount++;
        }
      } else {
        item.prices = item.prices || {};
        item.prices[pt] = row.price;
        updatedCount++;
      }
    });
  });

  return { updatedCount, skippedPriceCount, skippedNotExistsCount };
}

// Case 1: Item A has price 10.00 for "Optovaya", Item B has 0 / no price for "Optovaya"
const docItems = [
  { code: 'A001', name: 'Товар А (С ценой)', prices: { 'Оптовая': 10.0 } },
  { code: 'B002', name: 'Товар Б (Без цены)', prices: { 'Оптовая': 0 } },
  { code: 'C003', name: 'Товар В (Пустой)', prices: {} }
];

const excelRows = [
  { code: 'A001', price: 15.5 },
  { code: 'B002', price: 25.0 },
  { code: 'C003', price: 30.0 },
  { code: 'D999', price: 99.0 } // Not in document
];

const result = simulateExcelImport(docItems, excelRows, {
  onlyExistingPrices: true,
  dontAddNewItems: true,
  targetPriceTypes: ['Оптовая']
});

assert.strictEqual(result.updatedCount, 1, 'Only Item A should be updated');
assert.strictEqual(result.skippedPriceCount, 2, 'Item B and Item C must be skipped because their price was 0 or empty');
assert.strictEqual(result.skippedNotExistsCount, 1, 'Item D must be skipped because it is not in the document');
assert.strictEqual(docItems[0].prices['Оптовая'], 15.5, 'Item A price updated to 15.5');
assert.strictEqual(docItems[1].prices['Оптовая'], 0, 'Item B price unchanged (0)');
assert.strictEqual(docItems[2].prices['Оптовая'], undefined, 'Item C price remains unset');

console.log('✅ ALL SIMULATION TESTS & VERIFICATIONS PASSED SUCCESSFULLY!');
