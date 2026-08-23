import { renderMyCalendar } from './calendar.js';
import { render, renderKeepingOverrides } from './shift-ui.js';
import { S } from './state.js';

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=> b.classList.toggle('active', b === btn));
    const tab = btn.dataset.tab;
    document.getElementById('tab-mycal').classList.toggle('active', tab === 'mycal');
    document.getElementById('tab-shift').classList.toggle('active', tab === 'shift');
    if(tab === 'mycal') renderMyCalendar();
    if(tab === 'shift') render();
  });
});

export function rerenderTeacherViews(){
  renderMyCalendar();
  renderKeepingOverrides();
}
