const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Route to display the form
app.get('/', (req, res) => {
  res.render('index', { 
    corrected: null,
    originalText: '',
    hasResult: false,
    error: null
  });
});

// LanguageTool API integration
async function correctWithLanguageTool(text) {
  try {
    console.log('Sending to LanguageTool:', text.substring(0, 50) + '...');
    
    const response = await axios.post('https://api.languagetool.org/v2/check', null, {
      params: {
        text: text,
        language: 'en-US',
        enabledOnly: 'false'
      },
      timeout: 10000 // 10 second timeout
    });

    console.log('LanguageTool found', response.data.matches.length, 'potential issues');

    let correctedText = text;
    const matches = response.data.matches;

    // Apply corrections from end to beginning to maintain proper indices
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

// Enhanced fallback corrections
function enhancedFallbackCorrections(text) {
  if (!text) return '';
  
  const corrections = {
    // Common grammar mistakes
    '\\bi\\b': 'I',
    '\\bme and\\b': 'and I',
    '\\b(alot)\\b': 'a lot',
    '\\b(could|would|should) of\\b': '$1 have',
    '\\b(their|there|they\'re)\\b': match => {
      // Basic context-aware replacement (simplified)
      if (match.toLowerCase() === 'their') return 'their';
      if (match.toLowerCase() === 'there') return 'there';
      if (match.toLowerCase() === 'they\'re') return 'they\'re';
      return match;
    },
    // Verb corrections
    '\\b(goes|goed)\\b': 'goes', // Simplified - real AI would be smarter
    '\\b(buyed)\\b': 'bought',
    '\\b(runned)\\b': 'ran',
    // Common misspellings
    '\\b(recieve)\\b': 'receive',
    '\\b(seperate)\\b': 'separate',
    '\\b(definately)\\b': 'definitely',
    '\\b(occured)\\b': 'occurred'
  };

  let corrected = text;

  // Apply replacements
  for (const [pattern, replacement] of Object.entries(corrections)) {
    if (typeof replacement === 'function') {
      corrected = corrected.replace(new RegExp(pattern, 'gi'), replacement);
    } else {
      corrected = corrected.replace(new RegExp(pattern, 'gi'), replacement);
    }
  }

  // Punctuation fixes
  corrected = corrected.replace(/\s+([.,!?])/g, '$1');
  corrected = corrected.replace(/([.!?])\s*(\w)/g, '$1 $2');
  corrected = corrected.replace(/\s+/g, ' ');
  
  // Capitalize first letter of sentences
  corrected = corrected.replace(/(^\s*|[.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase());

  return corrected.trim();
}

// Route to handle form submission
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

  // Limit text length to prevent abuse
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
    
    // Use enhanced fallback when LanguageTool fails
    const correctedText = enhancedFallbackCorrections(originalText);
    
    res.render('index', {
      corrected: correctedText,
      originalText: originalText,
      hasResult: true,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).render('index', {
    corrected: null,
    originalText: req.body?.text || '',
    hasResult: false,
    error: 'An internal server error occurred. Please try again.'
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Grammar Correction App running at http://localhost:${port}`);
  console.log(`📝 Using LanguageTool API for AI-powered grammar checking`);
  console.log(`🆓 Completely free - no API key required`);
}); give combined
