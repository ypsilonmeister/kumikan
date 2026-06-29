import fs from 'fs';

async function run() {
  console.log('Fetching education kanji...');
  let kyoikuText = '';
  try {
    const res = await fetch('https://raw.githubusercontent.com/fnshr/kyo-kan/master/kyoiku-kanji-2020.csv');
    if (res.ok) {
      kyoikuText = await res.text();
      console.log('Fetched kyoiku-kanji-2020.csv');
    } else {
      throw new Error('2020.csv not found');
    }
  } catch (e) {
    console.log('Failed to fetch 2020.csv, trying 2017.csv...');
    try {
      const res = await fetch('https://raw.githubusercontent.com/fnshr/kyo-kan/master/kyoiku-kanji-2017.csv');
      if (res.ok) {
        kyoikuText = await res.text();
        console.log('Fetched kyoiku-kanji-2017.csv');
      } else {
        throw new Error('2017.csv not found');
      }
    } catch (e2) {
      console.error('Failed to fetch education kanji list:', e2.message);
      return;
    }
  }

  console.log('Fetching ids.txt...');
  let idsText = '';
  try {
    const idsRes = await fetch('https://raw.githubusercontent.com/cjkvi/cjkvi-ids/master/ids.txt');
    if (idsRes.ok) {
      idsText = await idsRes.text();
      console.log('Fetched ids.txt');
    } else {
      throw new Error('ids.txt not found');
    }
  } catch (e) {
    console.error('Failed to fetch IDS database:', e.message);
    return;
  }

  fs.writeFileSync('scripts/kyoiku.csv', kyoikuText);
  fs.writeFileSync('scripts/ids.txt', idsText);
  console.log('Saved raw files.');
}

run();
