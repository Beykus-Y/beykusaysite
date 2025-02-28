import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

// Настройка marked
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return code;
    },
    breaks: true,
    gfm: true
});

export { marked }; 