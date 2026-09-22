(function(){
  function setup(toggleId,navId){
    var toggle=document.getElementById(toggleId);
    var nav=document.getElementById(navId);
    if(!toggle||!nav)return;
    function close(){nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');}
    toggle.addEventListener('click',function(e){
      e.stopPropagation();
      var open=nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded',open?'true':'false');
    });
    nav.addEventListener('click',function(e){
      if(e.target.tagName==='A')close();
    });
    document.addEventListener('click',function(e){
      if(!nav.contains(e.target)&&!toggle.contains(e.target))close();
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape')close();
    });
  }
  setup('fullNavToggle','fullNavMenu');
})();
