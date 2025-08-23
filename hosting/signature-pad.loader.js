// 動態載入 CDN 版 signature_pad，載入完成後呼叫 window.__initSignaturePad()
(function(){
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/signature_pad@5.0.3/dist/signature_pad.umd.min.js';
  s.onload = function(){ if (window.__initSignaturePad) window.__initSignaturePad(); };
  document.head.appendChild(s);
})();
