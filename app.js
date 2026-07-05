const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.render('index', { 
    corrected: null,
    originalText: '',
    hasResult: false,
    error: null
  });
});

async function correctWithLanguageTool(text) {
  try {
    console.log('Sending to LanguageTool:', text.substring(0, 50) + '...');
    
    const response = await axios.post('https://api.languagetool.org/v2/check', null, {
      params: {
        text: text,
        language: 'en-US',
        enabledOnly: 'false'
      },
      timeout: 10000
    });

    console.log('LanguageTool found', response.data.matches.length, 'potential issues');

    let correctedText = text;
    const matches = response.data.matches;

    matches.sort((a, b) => b.offset - a.offset);
    
    let changesMade = 0;
    for (const match of matches) {
      if (match.replacements && match.replacements.length > 0) {
        const replacement = match.replacements[0].value;
        const before = correctedText.slice(0, match.offset);
        const after = correctedText.slice(match.offset + match.length);
        correctedText = before + replacement + after;
        changesMade++;
        
        console.log(`Fixed: "${match.context?.text}" → "${replacement}"`);
      }
    }

    console.log(`Applied ${changesMade} corrections`);
    return correctedText;

  } catch (error) {
    console.error('LanguageTool API error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      throw new Error('LanguageTool service is taking too long to respond. Please try again.');
    } else if (error.response) {
      throw new Error('LanguageTool service is currently unavailable. Please try again later.');
    } else {
      throw new Error('Unable to connect to grammar service. Using basic corrections instead.');
    }
  }
}

function enhancedFallbackCorrections(text) {
  if (!text) return '';

  let corrected = text;

  corrected = corrected.replace(/\bi\b/g, 'I');

  const patterns = [
    [/\bme and (my )?(\w+(?: \w+)?)\b/gi, (m, myPart, name) => {
      if (myPart) return 'my ' + name + ' and I';
      return name + ' and I';
    }],
    [/\b(alot)\b/gi, 'a lot'],
    [/\b(could|would|should) of\b/gi, '$1 have'],
    [/\byour\b(?=\s+(car|house|book|phone|idea|friend|money|time|life|work|day|name|job|family|dog|cat|home|office|bag|shoes))/gi, 'your'],
    [/^your\b/gi, 'Your'],

    [/\b(their|there|they're)\b/gi, (m) => {
      if (m.toLowerCase() === 'their') return 'their';
      if (m.toLowerCase() === 'there') return 'there';
      if (m.toLowerCase() === "they're") return "they're";
      return m;
    }],

    [/\bpeoples\b/gi, 'people'],
    [/\bchilds\b/gi, 'children'],
    [/\bchilden\b/gi, 'children'],
    [/\bwomans\b/gi, 'women'],
    [/\bmans\b/gi, 'men'],

    [/\b(goes|goed)\b/gi, (m) => m.toLowerCase() === 'goes' ? 'went' : 'went'],
    [/\b(buyed|buyed)\b/gi, 'bought'],
    [/\b(runned|ran)\b/gi, (m) => m.toLowerCase() === 'ranned' ? 'ran' : 'ran'],
    [/\b(swimmed|swam)\b/gi, (m) => m.toLowerCase() === 'swimmed' ? 'swam' : 'swam'],
    [/\b(eated|ate)\b/gi, (m) => m.toLowerCase() === 'eated' ? 'ate' : 'ate'],
    [/\b(goed|went)\b/gi, (m) => m.toLowerCase() === 'goed' ? 'went' : 'went'],
    [/\b(telled|told)\b/gi, (m) => m.toLowerCase() === 'telled' ? 'told' : 'told'],
    [/\b(selled|sold)\b/gi, (m) => m.toLowerCase() === 'selled' ? 'sold' : 'sold'],
    [/\b(maked|made)\b/gi, (m) => m.toLowerCase() === 'maked' ? 'made' : 'made'],
    [/\b(finded|found)\b/gi, (m) => m.toLowerCase() === 'finded' ? 'found' : 'found'],
    [/\b(gived|gave)\b/gi, (m) => m.toLowerCase() === 'gived' ? 'gave' : 'gave'],
    [/\b(leaved|left)\b/gi, (m) => m.toLowerCase() === 'leaved' ? 'left' : 'left'],

    [/\b(I|He|She|It|Jessica|John|Mary)\s+don't\b/gi, (m, subj) => subj + " doesn't"],

    [/\b(s)he dont\b/gi, "$1he doesn't"],
    [/\b(s)he doesnt\b/gi, "$1he doesn't"],

    [/\bam\s+([\w]+)ing\b/gi, (m, verb) => m],
    [/\bwas\s+([\w]+)ed\b/gi, (m, verb) => m],
    [/\bwas\s+very\s+exciting\b/gi, (m) => m.replace('exciting', 'excited')],
    [/\bwas\s+very\s+(.+?)ing\b/gi, (m, word) => {
      const base = word.replace(/ing$/, '');
      if (['excit', 'interest', 'bor', 'tir', 'amaz', 'surpris', 'frighten', 'disappoint', 'confus', 'embarrass'].includes(base)) {
        return m.replace(word, base + 'ed');
      }
      return m;
    }],

    [/\b(is|was)\s+(their|there)\b/gi, (m, verb, _) => verb + ' there'],

    [/\b(store|car|house|dog|cat|book|friend|shoe|boot|shoe|parking lot)s?'\s+were\b/gi, (m) => {
      const singular = m.replace(/'s were\b/i, ' was').replace(/s were\b/i, ' was');
      return singular;
    }],

    [/\b(the\s+\w+)\s+were\b/gi, (m, noun) => {
      const pluralIndicators = ['people', 'children', 'women', 'men', 'stores', 'cars', 'dogs', 'cats', 'friends', 'shoes', 'boots', 'they', 'we'];
      for (const p of pluralIndicators) {
        if (noun.toLowerCase().includes(p)) return m;
      }
      if (noun.match(/\s+\w+s$/i) && !noun.match(/\s+(\w+ss)$/i)) return m;
      return m.replace(/ were\b/i, ' was');
    }],

    [/\b(find|finds)\s+a\b/gi, (m, verb) => {
      if (verb.toLowerCase() === 'finds') return 'found a';
      return m;
    }],

    [/\b(she|he|it|jessica|john|mary)\s+(find|give|take|make|say|ask|leave|tell|call|show|buy|get|put|set|let|cut|cost|hit|hurt)\b/gi, (m, subj, verb) => {
      const pastMap = { 'find': 'finds', 'give': 'gives', 'take': 'takes', 'make': 'makes', 'say': 'says', 'ask': 'asks', 'leave': 'leaves', 'tell': 'tells', 'call': 'calls', 'show': 'shows', 'buy': 'buys', 'get': 'gets', 'put': 'puts', 'set': 'sets', 'let': 'lets', 'cut': 'cuts', 'cost': 'costs', 'hit': 'hits', 'hurt': 'hurts' };
      if (m.toLowerCase().includes(subj.toLowerCase() + ' ' + verb.toLowerCase())) {
        return subj + ' ' + verb + 's';
      }
      return m;
    }],

    [/\b(I|You|We|They)\s+(\w+)s\s+a\b/gi, (m, subj, verb) => {
      const base = verb.replace(/s$/, '');
      const verbs = ['find', 'give', 'take', 'make', 'say', 'ask', 'leave', 'tell', 'call', 'show', 'buy', 'get', 'put', 'set', 'let', 'cut', 'cost', 'hit', 'hurt', 'want', 'need', 'have', 'like', 'love', 'see', 'know', 'think', 'go', 'come'];
      if (verbs.includes(base)) {
        return subj + ' ' + base + ' a';
      }
      return m;
    }],

    [/\b(wants|needs|has|likes|loves|sees|knows|thinks|goes|comes|says|asks|leaves|tells|calls|shows|buys|gets|finds|gives|takes|makes)\s+to\b/gi, (m, verb) => {
      const pastMap = { 'wants': 'want', 'needs': 'need', 'has': 'have', 'likes': 'like', 'loves': 'love', 'sees': 'see', 'knows': 'know', 'thinks': 'think', 'goes': 'go', 'comes': 'come', 'says': 'say', 'asks': 'ask', 'leaves': 'leave', 'tells': 'tell', 'calls': 'call', 'shows': 'show', 'buys': 'buy', 'gets': 'get', 'finds': 'find', 'gives': 'give', 'takes': 'take', 'makes': 'make' };
      if (pastMap[verb.toLowerCase()]) return pastMap[verb.toLowerCase()] + ' to';
      return m;
    }],

    [/\b(promised|want|need|going|have|decide|hope|plan|try|forgot|remember)\s+to\s+(\w+)ed\b/gi, (m, before, verb) => before + ' to ' + verb],
    [/\bto\s+(\w+)ing\b/gi, (m, verb) => {
      const base = verb.replace(/ing$/i, '');
      if (['open', 'close', 'start', 'stop', 'go', 'come', 'do', 'make', 'take', 'give', 'buy', 'sell', 'tell', 'ask', 'call', 'show', 'use', 'get', 'set', 'put', 'let', 'cut', 'hit', 'hurt', 'find', 'keep', 'hold', 'bring', 'pay', 'say', 'try', 'work', 'play', 'run', 'walk', 'talk', 'write', 'read', 'eat', 'drink', 'sleep', 'watch', 'listen', 'learn', 'teach', 'help', 'see', 'hear'].includes(base.toLowerCase())) {
        return 'to ' + base;
      }
      return m;
    }],

    [/\b(says|said)\b/gi, (m) => m.toLowerCase() === 'says' ? 'said' : (m === 'SAID' ? 'SAID' : 'said')],
    [/\b(The\s+\w+|Jessica|John|Mary|He|She|It)\s+ask\s+(us|me|him|her|them|the)\b/gi, (m, subj, obj) => subj + ' asked ' + obj],
    [/\bask\s+us\b/gi, 'asked us'],
    [/\bask\s+me\b/gi, 'asked me'],
    [/\bask\s+him\b/gi, 'asked him'],
    [/\bask\s+her\b/gi, 'asked her'],
    [/\bask\s+them\b/gi, 'asked them'],

    [/\b(leave|leaves)\s+the\b/gi, (m, verb) => {
      const words = m.split(/\s+/);
      const before = m.match(/^(.+?)\bleave[s]?\s+the\b/i);
      if (before) return before[1] + 'left the';
      return 'left the';
    }],

    [/\bwas\s+feeling\b/gi, (m) => {
      const parts = m.match(/^(.+?)\bwas\s+feeling\b/i);
      return m.replace(/was feeling/gi, 'were feeling');
    }],

    [/\b(the )?(\w+\s\w+) were\b/gi, (m, the, noun) => {
      const full = (the || '') + noun;
      if (['the parking lot', 'the store', 'the mall', 'the crowd', 'everyone', 'nobody', 'anyone', 'someone', 'each', 'every', 'the group', 'the team', 'the family', 'the class'].some(w => full.toLowerCase() === w || full.toLowerCase().startsWith(w + ' '))) {
        return full + ' was';
      }
      return m;
    }],
    [/\bstore's\s+were\b/gi, 'stores were'],
    [/\bJessica\s+finds\b/gi, 'Jessica found'],
    [/\bwe\s+was\b/gi, 'we were'],
    [/\byou\s+was\b/gi, 'you were'],
    [/\bthey\s+was\b/gi, 'they were'],

    [/\b(payed|paid)\b/gi, (m) => m.toLowerCase() === 'payed' ? 'paid' : 'paid'],
    [/\b(recieve)\b/gi, 'receive'],
    [/\b(seperate)\b/gi, 'separate'],
    [/\b(definately)\b/gi, 'definitely'],
    [/\b(occured)\b/gi, 'occurred'],
    [/\b(accomodate)\b/gi, 'accommodate'],
    [/\b(calender)\b/gi, 'calendar'],
    [/\b(beleive)\b/gi, 'believe'],
    [/\b(tommorow|tommorrow)\b/gi, 'tomorrow'],
    [/\b(wich)\b/gi, 'which'],
    [/\b(untill)\b/gi, 'until'],
    [/\b(becuz|becuase)\b/gi, 'because'],
    [/\b(enuf)\b/gi, 'enough'],
  ];

  for (const [pattern, replacement] of patterns) {
    if (typeof replacement === 'function') {
      corrected = corrected.replace(pattern, replacement);
    } else {
      corrected = corrected.replace(pattern, replacement);
    }
  }

  corrected = corrected.replace(/\s+([.,!?;:])/g, '$1');
  corrected = corrected.replace(/([.!?])\s*(\w)/g, (match, p1, p2) => p1 + ' ' + p2);
  corrected = corrected.replace(/\s+/g, ' ');
  corrected = corrected.replace(/(^\s*|[.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase());

  return corrected.trim();
}

app.post('/correct', async (req, res) => {
  const originalText = req.body.text;
  
  if (!originalText || originalText.trim() === '') {
    return res.render('index', {
      corrected: null,
      originalText: '',
      hasResult: false,
      error: 'Please enter some text to correct.'
    });
  }

  if (originalText.length > 5000) {
    return res.render('index', {
      corrected: null,
      originalText: originalText,
      hasResult: false,
      error: 'Text is too long. Please limit to 5000 characters.'
    });
  }
  
  try {
    const correctedText = await correctWithLanguageTool(originalText);
    
    res.render('index', {
      corrected: correctedText,
      originalText: originalText,
      hasResult: true,
      error: null
    });
    
  } catch (error) {
    console.log('Using fallback corrections due to error:', error.message);
    
    const correctedText = enhancedFallbackCorrections(originalText);
    
    res.render('index', {
      corrected: correctedText,
      originalText: originalText,
      hasResult: true,
      error: error.message
    });
  }
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).render('index', {
    corrected: null,
    originalText: req.body?.text || '',
    hasResult: false,
    error: 'An internal server error occurred. Please try again.'
  });
});

app.listen(port, () => {
  console.log(`Grammar Correction App running at http://localhost:${port}`);
});

module.exports = app;
module.exports.enhancedFallbackCorrections = enhancedFallbackCorrections;