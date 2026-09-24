export function setupSignature(canvas, clearButton, placeholder) {
  const context = canvas.getContext('2d');
  let drawing = false;
  let hasSignature = false;

  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#61352d';

  function point(event) {
    const bounds = canvas.getBoundingClientRect();
    const source = event.touches ? event.touches[0] : event;
    return {
      x: (source.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (source.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  }

  function start(event) {
    event.preventDefault();
    drawing = true;
    hasSignature = true;
    placeholder.hidden = true;
    placeholder.classList.add('is-hidden');
    placeholder.setAttribute('aria-hidden', 'true');
    canvas.setPointerCapture?.(event.pointerId);
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
  }

  function draw(event) {
    if (!drawing) return;
    event.preventDefault();
    const position = point(event);
    context.lineTo(position.x, position.y);
    context.stroke();
  }

  function end(event) {
    drawing = false;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', draw);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);
  clearButton.addEventListener('click', () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature = false;
    placeholder.hidden = false;
    placeholder.classList.remove('is-hidden');
    placeholder.setAttribute('aria-hidden', 'false');
  });

  return {
    hasSignature: () => hasSignature,
    dataUrl: () => canvas.toDataURL('image/png'),
  };
}
