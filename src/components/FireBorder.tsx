
import React, { useRef, useEffect } from 'react';

interface FireBorderProps {
  children: React.ReactNode;
}

const FireBorder: React.FC<FireBorderProps> = ({ children }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationFrameId: number;
    let particles: Particle[] = [];
    let hue = 15; // Start with orange
    
    // Set canvas dimensions
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      color: string;
      life: number;
      maxLife: number;
      side: 'top' | 'right' | 'bottom' | 'left';
      
      constructor(x: number, y: number, side: 'top' | 'right' | 'bottom' | 'left') {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.side = side;
        
        // Adjust speed direction based on which side the particle is on
        switch(side) {
          case 'top':
            this.speedX = Math.random() * 2 - 1; // -1 to 1
            this.speedY = Math.random() * 2; // 0 to 2 (downward)
            break;
          case 'right':
            this.speedX = -Math.random() * 2; // -2 to 0 (leftward)
            this.speedY = Math.random() * 2 - 1; // -1 to 1
            break;
          case 'bottom':
            this.speedX = Math.random() * 2 - 1; // -1 to 1
            this.speedY = -Math.random() * 2; // -2 to 0 (upward)
            break;
          case 'left':
            this.speedX = Math.random() * 2; // 0 to 2 (rightward)
            this.speedY = Math.random() * 2 - 1; // -1 to 1
            break;
        }
        
        this.color = `hsl(${Math.random() * 30 + 5}, 100%, ${Math.random() * 20 + 50}%)`;
        this.maxLife = 40 + Math.random() * 20;
        this.life = this.maxLife;
      }
      
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.size > 0.2) this.size -= 0.1;
        this.life--;
      }
      
      draw() {
        if (!ctx) return;
        
        // Add glow effect
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        
        // Draw fire particle
        const opacity = (this.life / this.maxLife) * 0.7; // Fade out as life decreases
        ctx.fillStyle = this.color.replace(')', `, ${opacity})`).replace('hsl', 'hsla');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    const createParticles = () => {
      const density = 1.5; // Lower value = more particles
      const edgeOffset = 3; // How far from the edge to start particles
      
      // Top edge
      for (let i = 0; i < canvas.width / density; i++) {
        if (Math.random() > 0.85) {
          particles.push(new Particle(i * density, edgeOffset, 'top'));
        }
      }
      
      // Right edge
      for (let i = 0; i < canvas.height / density; i++) {
        if (Math.random() > 0.85) {
          particles.push(new Particle(canvas.width - edgeOffset, i * density, 'right'));
        }
      }
      
      // Bottom edge
      for (let i = 0; i < canvas.width / density; i++) {
        if (Math.random() > 0.85) {
          particles.push(new Particle(i * density, canvas.height - edgeOffset, 'bottom'));
        }
      }
      
      // Left edge
      for (let i = 0; i < canvas.height / density; i++) {
        if (Math.random() > 0.85) {
          particles.push(new Particle(edgeOffset, i * density, 'left'));
        }
      }
    };
    
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Add new particles
      createParticles();
      
      // Update and draw particles
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        
        // Remove dead particles
        if (particles[i].life <= 0 || particles[i].size <= 0.2) {
          particles.splice(i, 1);
          i--;
        }
      }
      
      // Cycle hue for color variation (between orange-red range)
      hue = 15 + Math.sin(Date.now() * 0.0005) * 10;
      
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);
  
  return (
    <div className="relative" ref={containerRef}>
      <canvas 
        ref={canvasRef} 
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
      />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

export default FireBorder;
