let count = 3;
const countdownNumber = document.getElementById('countdown-number');

if (countdownNumber) {
  countdownNumber.textContent = count;
  
  const interval = setInterval(() => {
    count--;

    // 1. Update the content based on the new count FIRST
    if (count > 0) {
      countdownNumber.textContent = count;
    } else if (count === 0) {
      countdownNumber.textContent = 'Go!';
      countdownNumber.style.fontSize = '100px';
      countdownNumber.style.fontWeight = '700';
      countdownNumber.style.color = 'rgb(255, 255, 255)';
    } else {
      clearInterval(interval);
      return;
    }

    // 2. Then, force-restart the animation on the new content
    countdownNumber.style.animation = 'none';
    void countdownNumber.offsetHeight; // This is a trick to trigger a DOM reflow
    countdownNumber.style.animation = 'countdownEffect 1s ease-in-out';

  }, 1000);
}