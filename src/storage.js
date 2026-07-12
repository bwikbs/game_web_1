// localStorage 기반 세이브
const KEY = 'webcraft-save-v1';

export function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('저장 실패:', e);
  }
}

export function clearSave() {
  localStorage.removeItem(KEY);
}
