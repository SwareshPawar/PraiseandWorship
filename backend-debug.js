// Backend Management Debug Script - Add to browser console
console.log('=== Backend Management Debug ===');

// Check if elements exist
const backendTab = document.getElementById('backendMgmtTab');
const backendContent = document.getElementById('backendMgmtTabContent');

console.log('Backend Tab Element:', backendTab);
console.log('Backend Content Element:', backendContent);

if (backendTab) {
    console.log('✅ Backend tab exists');
    console.log('Tab classes:', backendTab.className);
    console.log('Tab onclick:', backendTab.onclick);
} else {
    console.log('❌ Backend tab missing');
}

if (backendContent) {
    console.log('✅ Backend content exists');
    console.log('Content classes:', backendContent.className);
    console.log('Content style.display:', backendContent.style.display);
    console.log('Content computed display:', getComputedStyle(backendContent).display);
    console.log('Content innerHTML length:', backendContent.innerHTML.length);
} else {
    console.log('❌ Backend content missing');
}

// Check if functions exist
console.log('getStoredBackend function:', typeof getStoredBackend);
console.log('setBackend function:', typeof setBackend);
console.log('initializeBackendManagement function:', typeof initializeBackendManagement);

// Test clicking the tab
if (backendTab) {
    console.log('Testing tab click...');
    backendTab.click();
    
    setTimeout(() => {
        console.log('After click - Content classes:', backendContent?.className);
        console.log('After click - Content display:', backendContent?.style.display);
        console.log('After click - Content computed display:', getComputedStyle(backendContent).display);
    }, 100);
}