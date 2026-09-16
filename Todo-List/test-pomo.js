const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf-8');
const scriptCode = fs.readFileSync('script.js', 'utf-8');

const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;
const document = window.document;

// Mock localStorage
window.localStorage = {
  getItem: () => null,
  setItem: () => {}
};
// Mock matchMedia
window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

try {
    const scriptEl = document.createElement("script");
    scriptEl.textContent = scriptCode;
    document.body.appendChild(scriptEl);

    // Give it a tick to execute DOMContentLoaded
    setTimeout(() => {
        const startBtn = document.getElementById('pomo-start');
        console.log("Start Button:", startBtn.outerHTML);
        
        startBtn.click();
        
        console.log("Start button display after click:", startBtn.style.display);
        const pauseBtn = document.getElementById('pomo-pause');
        console.log("Pause button display after click:", pauseBtn.style.display);
    }, 100);
} catch (e) {
    console.error(e);
}
