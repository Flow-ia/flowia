// Helpers Categories

// Format duree minutes -> "1h30" / "30 min"
export const formatDuration = (dMin) => {
  if (dMin >= 60) {
    const h = Math.floor(dMin / 60);
    const m = dMin % 60;
    return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
  }
  return `${dMin} min`;
};

// Reordonne un tableau par drag&drop : deplace from -> to
export const reorderArray = (arr, from, to) => {
  if (from < 0 || to < 0) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
