/* Localize the prototype without rebuilding forms or losing edited quantities. */
(() => {
  const texts = {
    'Заказы покупателей — изменение':'Alıcı sifarişləri — düzəliş',
    'Сынаq frontend':'Sınaq interfeysi',
    '💾 Записать (тест)':'💾 Yadda saxla (sınaq)',
    '✎ Изменить товар по магазинам':'✎ Mağazalar üzrə məhsulu dəyiş',
    '＋ Добавить товар в заказы':'＋ Sifarişlərə məhsul əlavə et',
    '↶ Вернуть исходные данные':'↶ İlkin məlumatları bərpa et',
    'Найти':'Axtar',
    'Заказ, магазин, код или название товара…':'Sifariş, mağaza, kod və ya məhsul adı…',
    '＋ Добавить товар':'＋ Məhsul əlavə et',
    'Проведён':'Təsdiqlənib', 'Черновик':'Qaralama', 'Изменён':'Dəyişdirilib',
    'Код':'Kod','Товар':'Məhsul','Ед.':'Vahid','Количество':'Miqdar','Цена':'Qiymət','Сумма':'Məbləğ',
    'Добавлен':'Əlavə edilib','Удалить товар':'Məhsulu sil',
    'Изменить количество этого товара по магазинам':'Bu məhsulun miqdarını mağazalar üzrə dəyiş',
    'В заказе нет товаров. Добавьте товар.':'Sifarişdə məhsul yoxdur. Məhsul əlavə et.',
    'Поиск не дал результатов.':'Axtarış nəticə vermədi.',
    'Нет показанных заказов. Сначала отфильтруйте журнал.':'Göstərilən sifariş yoxdur. Əvvəlcə jurnalı filtrlə.',
    'Открыть 3 примера для проверки интерфейса':'İnterfeysi yoxlamaq üçün 3 nümunə aç',
    'Отмена':'Ləğv et','Применить':'Tətbiq et',
    'Товар (сınaq kataloqu)':'Məhsul (sınaq kataloqu)',
    'Изменить товар по магазинам':'Məhsulu mağazalar üzrə dəyiş',
    '⇄ Заменить выбранный товар другим':'⇄ Seçilmiş məhsulu başqası ilə əvəz et',
    'Отметьте нужные заказы и измените количество напротив каждого магазина.':'Lazım olan sifarişləri seç və hər mağazanın qarşısında miqdarı dəyiş.',
    'Магазин':'Mağaza','Заказ':'Sifariş','Сейчас':'Hazırkı miqdar','Новое количество':'Yeni miqdar',
    'Заменить товар по магазинам':'Məhsulu mağazalar üzrə əvəz et',
    'Добавить товар в выбранные заказы':'Seçilmiş sifarişlərə məhsul əlavə et',
    'Найти новый товар':'Yeni məhsulu axtar','Найти товар':'Məhsulu axtar',
    'Код или название · сınaq kataloqu':'Kod və ya ad · sınaq kataloqu',
    'Выбранный товар':'Seçilmiş məhsul','Общее количество':'Ümumi miqdar','Например: 100':'Məsələn: 100',
    'Распределить поровну':'Bərabər bölüşdür','Выбрать все':'Hamısını seç',
    'Заполнить по кодам магазинов (из Excel / списка)':'Mağaza kodlarına görə doldur (Excel / siyahıdan)',
    'Одна строка: код магазина и общее количество. Если у магазина несколько заказов, количество делится между ними.':'Hər sətirdə mağaza kodu və ümumi miqdar yaz. Mağazanın bir neçə sifarişi varsa, miqdar onların arasında bölünür.',
    'Заполнить по кодам':'Kodlara görə doldur','Код магазина':'Mağaza kodu','Добавить':'Əlavə ediləcək miqdar',
    'Товар не найден в сınaq каталоге':'Məhsul sınaq kataloqunda tapılmadı',
    'Старый товар удаляется только из отмеченных заказов. Цена и единица берутся у нового товара. Если новый товар уже есть, количества суммируются. Данные остаются только в сınaq пəncərəsində.':'Köhnə məhsul yalnız seçilmiş sifarişlərdən çıxarılır. Qiymət və vahid yeni məhsuldan götürülür. Yeni məhsul artıq varsa, miqdarlar toplanır. Məlumatlar yalnız sınaq pəncərəsində qalır.',
    'Указанное количество прибавляется к товару, если он уже есть в заказе. Данные остаются только в сınaq пəncərəsində.':'Məhsul sifarişdə artıq varsa, yazılan miqdar mövcud miqdara əlavə edilir. Məlumatlar yalnız sınaq pəncərəsində qalır.',
    'Заказ изменить':'Sifarişə düzəliş et',
    'Перенести показанные заказы в окно изменения':'Göstərilən sifarişləri düzəliş pəncərəsinə keçir'
  };
  const prefixes = [
    ['Заказ покупателя № ','Alıcı sifarişi № '],['Магазин:','Mağaza:'],['Склад:','Anbar:'],['Портфель:','Portfel:'],['Дата:','Tarix:'],
    ['Товаров: ','Məhsul sayı: '],['Итого:','Yekun:'],['Было: ','Əvvəl: '],
    ['Добавить товар · № ','Məhsul əlavə et · № '],['Заменяем:','Əvəz edilən:'],['Выбрано заказов: ','Seçilmiş sifarişlər: ']
  ];
  const reverse = new Map(Object.entries(texts).map(([ru,az])=>[az,ru]));
  const originals = new WeakMap();
  const attrs = new WeakMap();
  const language=()=>window.C1I18n?.getLanguage() || 'az';
  function translate(value) {
    const leading=value.match(/^\s*/)[0],trailing=value.match(/\s*$/)[0],text=value.trim();
    if(!text)return value;
    let result=language()==='az'?(texts[text] || text):(reverse.get(text) || text);
    for(const [ru,az] of prefixes) {
      const source=language()==='az'?ru:az,target=language()==='az'?az:ru;
      if(result.startsWith(source)){result=target+result.slice(source.length);break;}
    }
    result=result.replace(language()==='az'?' · Общее количество: ':' · Ümumi miqdar: ',language()==='az'?' · Ümumi miqdar: ':' · Общее количество: ');
    // Dynamic number input accessibility label, preserving item/order identifiers.
    if(language()==='az' && /^Количество .* в заказе /.test(result))result=result.replace(/^Количество /,'Miqdar ').replace(' в заказе ',' · sifariş ');
    return leading+result+trailing;
  }
  function localize(root) {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())) {
      // Product names and customer data are kept exactly as supplied.
      if(node.parentElement?.closest('.obe-product-button,option'))continue;
      const previous=originals.get(node);
      const raw=previous && previous.last===node.nodeValue?previous.raw:node.nodeValue;
      const translated=translate(raw);
      originals.set(node,{raw,last:translated});
      if(node.nodeValue!==translated)node.nodeValue=translated;
    }
    root.querySelectorAll('[title],[placeholder],[aria-label]').forEach(el=>{
      const record=attrs.get(el) || {};
      for(const name of ['title','placeholder','aria-label']) {
        if(!el.hasAttribute(name))continue;
        const value=el.getAttribute(name),old=record[name],raw=old && old.last===value?old.raw:value,translated=translate(raw);
        record[name]={raw,last:translated};if(value!==translated)el.setAttribute(name,translated);
      }
      attrs.set(el,record);
    });
  }
  function init() {
    const roots=[document.getElementById('orderBatchEditorWindow'),document.getElementById('obeOperationWindow'),...document.querySelectorAll('[id^="ujOrderEditAction"]')].filter(Boolean);
    roots.forEach(root=>{
      localize(root);
      new MutationObserver(()=>localize(root)).observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label']});
    });
    window.addEventListener('c1-language-changed',()=>{
      roots.forEach(localize);
      const win=window.MdiManager?.windows?.orderBatchEditorWindow;
      if(win){win.title=language()==='az'?'Sifarişlər — düzəliş (sınaq)':'Заказы — изменение (тест)';if(win.tabElement){const label=win.tabElement.querySelector('.mdi-tab-label');if(label)label.textContent=win.title;}}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
