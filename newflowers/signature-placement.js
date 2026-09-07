const place = () => {
 const target = document.querySelector("body");
 if(!target || target.querySelector('shin86-signature')) return;
 const host = document.createElement('div'); host.className = 'signature-placement'; host.style.cssText = "position:fixed;left:20px;bottom:18px;z-index:5;--signature-ink:#604b3f;";
 host.innerHTML = '<shin86-signature ></shin86-signature>'; target.append(host);
};
place();
new MutationObserver(place).observe(document.body,{childList:true,subtree:true});
