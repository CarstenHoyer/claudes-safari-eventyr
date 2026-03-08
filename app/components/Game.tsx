"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  playGrassStep,
  playCoinPling,
  playDeath,
  playJump,
  playSwing,
  playHit,
  playPickup,
  startMusic,
  stopMusic,
} from "./sounds";

// --- Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const GRAVITY = 0.6;
const JUMP_FORCE = -13;
const MOVE_SPEED = 5;
const PLAYER_SIZE = 40;
const GROUND_Y = CANVAS_HEIGHT - 60;
const SCROLL_THRESHOLD = 350;
const ATTACK_DURATION = 20; // frames
const ATTACK_RANGE = 50;
const ENEMY_SPEED = 1.5;
const ENEMY_AGGRO_RANGE = 250;
const ENEMY_ATTACK_RANGE = 45;
const ENEMY_ATTACK_DURATION = 25;
const ENEMY_ATTACK_COOLDOWN = 60;

// --- Types ---
interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface Coin {
  x: number;
  y: number;
  collected: boolean;
}

type WeaponType = "sword" | "axe" | "hammer";

interface Weapon {
  x: number;
  y: number;
  type: WeaponType;
  onGround: boolean;
}

interface Enemy {
  x: number;
  y: number;
  vy: number;
  facing: number;
  onGround: boolean;
  hp: number;
  attackTimer: number; // >0 means attacking
  attackCooldown: number;
  weaponType: WeaponType;
  dead: boolean;
  deathTimer: number;
}

interface ShopItem {
  name: string;
  type: "heart" | "weapon";
  weaponType?: WeaponType;
  cost: number;
  sold: boolean;
}

interface Shop {
  x: number;
  y: number;
  items: ShopItem[];
  selectedIndex: number;
  active: boolean; // player is near and shop is open
}

interface Boss {
  x: number;
  y: number;
  vy: number;
  facing: number;
  onGround: boolean;
  hp: number;
  maxHp: number;
  attackTimer: number;
  attackCooldown: number;
  dead: boolean;
  deathTimer: number;
  phase: number; // gets harder as HP drops
}

interface Player {
  x: number;
  y: number;
  vy: number;
  vx: number;
  onGround: boolean;
  facing: number;
  weapon: WeaponType | null;
  attackTimer: number;
  hp: number;
  invincible: number;
  jumpsLeft: number;
  hasJetpack: boolean;
  jetpackFuel: number;
  minigunCooldown: number;
  bullets: { x: number; y: number; vx: number }[];
}

// --- Draw Claude's sparkle icon as the player character ---
function drawClaude(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  facing: number,
  isRunning: boolean,
  frame: number,
  weapon: WeaponType | null,
  attackTimer: number,
  invincible: number,
  hasJetpack: boolean = false,
  jetpackFuel: number = 0,
  isFlying: boolean = false
) {
  ctx.save();
  ctx.translate(x, y);

  // Flash when invincible
  if (invincible > 0 && Math.floor(invincible / 3) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  // Slight bounce when running
  const bounce = isRunning ? Math.sin(frame * 0.3) * 2 : 0;
  ctx.translate(0, bounce);

  // Body - blue Claude
  const bodyColor = "#4A7AB5";
  const bodyLight = "#6B9BD2";

  // Main body (rounded rectangle)
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  const bw = size * 0.7;
  const bh = size * 0.8;
  const bx = -bw / 2;
  const by = -bh / 2 - size * 0.05;
  const radius = bw * 0.3;
  ctx.moveTo(bx + radius, by);
  ctx.lineTo(bx + bw - radius, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
  ctx.lineTo(bx + bw, by + bh - radius);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
  ctx.lineTo(bx + radius, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
  ctx.lineTo(bx, by + radius);
  ctx.quadraticCurveTo(bx, by, bx + radius, by);
  ctx.closePath();
  ctx.fill();

  // Highlight on body
  ctx.fillStyle = bodyLight;
  ctx.beginPath();
  ctx.ellipse(-bw * 0.1, by + bh * 0.3, bw * 0.2, bh * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeOffsetX = size * 0.12;
  const eyeY = -size * 0.12;
  const eyeSize = size * 0.07;

  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.ellipse(-eyeOffsetX, eyeY, eyeSize * 1.4, eyeSize * 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeOffsetX, eyeY, eyeSize * 1.4, eyeSize * 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2D1B0E";
  const pupilShift = facing * eyeSize * 0.4;
  ctx.beginPath();
  ctx.arc(-eyeOffsetX + pupilShift, eyeY, eyeSize * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeOffsetX + pupilShift, eyeY, eyeSize * 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = "#2D1B0E";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, eyeY + size * 0.12, size * 0.1, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // Safari hat (pith helmet / explorer hat)
  drawSafariHat(ctx, size);

  // Sparkle on top of hat
  drawSparkle(ctx, 0, -size * 0.75, size * 0.14, frame);

  // Legs
  const legY = by + bh;
  const legSpread = isRunning ? Math.sin(frame * 0.3) * 4 : 3;
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-bw * 0.3 - legSpread * 0.5, legY, size * 0.15, size * 0.2);
  ctx.fillRect(bw * 0.15 + legSpread * 0.5, legY, size * 0.15, size * 0.2);

  ctx.fillStyle = "#2D1B0E";
  ctx.fillRect(-bw * 0.35 - legSpread * 0.5, legY + size * 0.15, size * 0.2, size * 0.08);
  ctx.fillRect(bw * 0.1 + legSpread * 0.5, legY + size * 0.15, size * 0.2, size * 0.08);

  // Draw jetpack on back
  if (hasJetpack) {
    const jpSide = -facing; // jetpack on the back
    ctx.save();
    // Jetpack body
    ctx.fillStyle = "#555";
    ctx.fillRect(jpSide * size * 0.25 - 6, -size * 0.15, 12, size * 0.45);
    // Jetpack tanks
    ctx.fillStyle = "#777";
    ctx.beginPath();
    ctx.ellipse(jpSide * size * 0.25 - 3, -size * 0.1, 4, size * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(jpSide * size * 0.25 + 3, -size * 0.1, 4, size * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    // Fuel indicator on jetpack
    const fuelRatio = jetpackFuel / 200;
    ctx.fillStyle = fuelRatio > 0.3 ? "#4CAF50" : "#FF5722";
    ctx.fillRect(jpSide * size * 0.25 - 4, -size * 0.05 + size * 0.2 * (1 - fuelRatio), 8, size * 0.2 * fuelRatio);

    // Flame particles when flying
    if (isFlying && jetpackFuel > 0) {
      for (let fi = 0; fi < 4; fi++) {
        const flameY = size * 0.3 + fi * 5 + Math.random() * 6;
        const flameX = jpSide * size * 0.25 + (Math.random() - 0.5) * 10;
        const flameSize = 3 + Math.random() * 4;
        ctx.fillStyle = fi < 2 ? "#FF6600" : "#FFCC00";
        ctx.globalAlpha = 0.8 - fi * 0.15;
        ctx.beginPath();
        ctx.arc(flameX, flameY, flameSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Draw minigun in front
    ctx.save();
    const mgX = facing * size * 0.35;
    const mgY = -size * 0.05;
    ctx.fillStyle = "#444";
    ctx.fillRect(mgX, mgY - 3, facing * size * 0.5, 6); // barrel
    ctx.fillStyle = "#666";
    ctx.fillRect(mgX - 4, mgY - 5, 8, 10); // body
    // Muzzle flash when shooting
    if (isFlying) {
      ctx.fillStyle = "#FFAA00";
      ctx.globalAlpha = 0.6 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.arc(mgX + facing * size * 0.52, mgY, 4 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Draw weapon if holding one (not when has jetpack - minigun replaces it)
  if (weapon && !hasJetpack) {
    drawHeldWeapon(ctx, size, facing, weapon, attackTimer);
  }

  ctx.restore();
}

// --- Draw enemy (Claude with viking helmet) ---
function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  frame: number
) {
  const { x, y, facing, onGround, attackTimer, weaponType, dead, deathTimer } = enemy;

  ctx.save();
  ctx.translate(x, y);

  if (dead) {
    // Fall over animation
    const angle = Math.min(deathTimer * 0.05, Math.PI / 2) * facing;
    ctx.rotate(angle);
    ctx.globalAlpha = Math.max(0, 1 - deathTimer * 0.02);
  }

  const size = PLAYER_SIZE;
  const isMoving = !dead && onGround;
  const bounce = isMoving ? Math.sin(frame * 0.25) * 2 : 0;
  ctx.translate(0, bounce);

  // Body - darker/evil red tint
  const bodyColor = "#8B3A3A";
  const bodyLight = "#A04848";

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  const bw = size * 0.7;
  const bh = size * 0.8;
  const bx = -bw / 2;
  const by = -bh / 2 - size * 0.05;
  const radius = bw * 0.3;
  ctx.moveTo(bx + radius, by);
  ctx.lineTo(bx + bw - radius, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
  ctx.lineTo(bx + bw, by + bh - radius);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
  ctx.lineTo(bx + radius, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
  ctx.lineTo(bx, by + radius);
  ctx.quadraticCurveTo(bx, by, bx + radius, by);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = bodyLight;
  ctx.beginPath();
  ctx.ellipse(-bw * 0.1, by + bh * 0.3, bw * 0.2, bh * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // Angry eyes
  const eyeOffsetX = size * 0.12;
  const eyeY = -size * 0.12;
  const eyeSize = size * 0.07;

  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.ellipse(-eyeOffsetX, eyeY, eyeSize * 1.4, eyeSize * 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeOffsetX, eyeY, eyeSize * 1.4, eyeSize * 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Red pupils
  ctx.fillStyle = "#CC0000";
  const ePupilShift = facing * eyeSize * 0.4;
  ctx.beginPath();
  ctx.arc(-eyeOffsetX + ePupilShift, eyeY, eyeSize * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeOffsetX + ePupilShift, eyeY, eyeSize * 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Angry eyebrows
  ctx.strokeStyle = "#2D1B0E";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-eyeOffsetX - eyeSize, eyeY - eyeSize * 2.5);
  ctx.lineTo(-eyeOffsetX + eyeSize, eyeY - eyeSize * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(eyeOffsetX + eyeSize, eyeY - eyeSize * 2.5);
  ctx.lineTo(eyeOffsetX - eyeSize, eyeY - eyeSize * 1.5);
  ctx.stroke();

  // Frown
  ctx.strokeStyle = "#2D1B0E";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, eyeY + size * 0.18, size * 0.08, 1.1 * Math.PI, 1.9 * Math.PI);
  ctx.stroke();

  // Viking helmet!
  drawVikingHelmet(ctx, size);

  // Legs
  const legY = by + bh;
  const legSpread = isMoving ? Math.sin(frame * 0.25) * 4 : 3;
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-bw * 0.3 - legSpread * 0.5, legY, size * 0.15, size * 0.2);
  ctx.fillRect(bw * 0.15 + legSpread * 0.5, legY, size * 0.15, size * 0.2);
  ctx.fillStyle = "#2D1B0E";
  ctx.fillRect(-bw * 0.35 - legSpread * 0.5, legY + size * 0.15, size * 0.2, size * 0.08);
  ctx.fillRect(bw * 0.1 + legSpread * 0.5, legY + size * 0.15, size * 0.2, size * 0.08);

  // Enemy weapon
  if (!dead) {
    drawHeldWeapon(ctx, size, facing, weaponType, attackTimer);
  }

  ctx.restore();
}

// --- Viking helmet ---
function drawVikingHelmet(ctx: CanvasRenderingContext2D, size: number) {
  const helmW = size * 0.5;
  const helmH = size * 0.25;
  const helmY = -size * 0.42;

  // Main helmet dome
  ctx.fillStyle = "#8B8B8B";
  ctx.beginPath();
  ctx.ellipse(0, helmY, helmW * 0.55, helmH, 0, Math.PI, 0);
  ctx.fill();

  // Helmet band
  ctx.fillStyle = "#6B6B6B";
  ctx.fillRect(-helmW * 0.55, helmY - 2, helmW * 1.1, 5);

  // Nose guard
  ctx.fillStyle = "#7B7B7B";
  ctx.fillRect(-2, helmY, 4, size * 0.15);

  // Left horn
  ctx.fillStyle = "#F5E6C8";
  ctx.beginPath();
  ctx.moveTo(-helmW * 0.45, helmY - 2);
  ctx.quadraticCurveTo(-helmW * 0.8, helmY - helmH * 1.8, -helmW * 0.3, helmY - helmH * 2.2);
  ctx.lineTo(-helmW * 0.15, helmY - helmH * 1.6);
  ctx.quadraticCurveTo(-helmW * 0.5, helmY - helmH * 1.2, -helmW * 0.3, helmY - 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#D4C4A0";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Right horn
  ctx.fillStyle = "#F5E6C8";
  ctx.beginPath();
  ctx.moveTo(helmW * 0.45, helmY - 2);
  ctx.quadraticCurveTo(helmW * 0.8, helmY - helmH * 1.8, helmW * 0.3, helmY - helmH * 2.2);
  ctx.lineTo(helmW * 0.15, helmY - helmH * 1.6);
  ctx.quadraticCurveTo(helmW * 0.5, helmY - helmH * 1.2, helmW * 0.3, helmY - 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#D4C4A0";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// --- Draw weapon held by character ---
function drawHeldWeapon(
  ctx: CanvasRenderingContext2D,
  size: number,
  facing: number,
  weaponType: WeaponType,
  attackTimer: number
) {
  ctx.save();

  const handX = facing * size * 0.35;
  const handY = size * 0.05;
  ctx.translate(handX, handY);

  // Swing animation
  if (attackTimer > 0) {
    const swingProgress = 1 - attackTimer / ATTACK_DURATION;
    const swingAngle = facing * (swingProgress * Math.PI * 0.8 - Math.PI * 0.3);
    ctx.rotate(swingAngle);
  } else {
    ctx.rotate(facing * -0.3);
  }

  if (weaponType === "sword") {
    // Sword handle
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-2, -4, 4, 12);
    // Guard
    ctx.fillStyle = "#DAA520";
    ctx.fillRect(-6, -5, 12, 3);
    // Blade
    ctx.fillStyle = "#C0C0C0";
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(3, -5);
    ctx.lineTo(1, -28);
    ctx.lineTo(0, -30);
    ctx.lineTo(-1, -28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#E8E8E8";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  } else if (weaponType === "axe") {
    // Handle
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-2, -4, 4, 14);
    // Axe head
    ctx.fillStyle = "#808080";
    ctx.beginPath();
    ctx.moveTo(-1, -4);
    ctx.lineTo(-12, -12);
    ctx.lineTo(-10, -20);
    ctx.lineTo(-1, -16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#606060";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (weaponType === "hammer") {
    // Handle
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-2, -4, 4, 16);
    // Hammer head
    ctx.fillStyle = "#696969";
    ctx.fillRect(-8, -14, 16, 10);
    ctx.strokeStyle = "#505050";
    ctx.lineWidth = 1;
    ctx.strokeRect(-8, -14, 16, 10);
  }

  ctx.restore();
}

// --- Draw weapon on ground ---
function drawGroundWeapon(
  ctx: CanvasRenderingContext2D,
  weapon: Weapon,
  frame: number
) {
  const { x, y, type } = weapon;
  ctx.save();
  ctx.translate(x, y);

  // Floating bob
  const bob = Math.sin(frame * 0.06) * 3;
  ctx.translate(0, bob);

  // Glow effect
  ctx.shadowColor = "#FFD700";
  ctx.shadowBlur = 10 + Math.sin(frame * 0.1) * 5;

  if (type === "sword") {
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-2, 2, 4, 10);
    ctx.fillStyle = "#DAA520";
    ctx.fillRect(-5, 0, 10, 3);
    ctx.fillStyle = "#C0C0C0";
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.lineTo(3, 0);
    ctx.lineTo(1, -20);
    ctx.lineTo(0, -22);
    ctx.lineTo(-1, -20);
    ctx.closePath();
    ctx.fill();
  } else if (type === "axe") {
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-2, 0, 4, 14);
    ctx.fillStyle = "#808080";
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-10, -16);
    ctx.lineTo(-1, -12);
    ctx.closePath();
    ctx.fill();
  } else if (type === "hammer") {
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-2, 0, 4, 14);
    ctx.fillStyle = "#696969";
    ctx.fillRect(-8, -10, 16, 10);
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawSafariHat(ctx: CanvasRenderingContext2D, size: number) {
  const hatY = -size * 0.38;

  // Wide brim
  ctx.fillStyle = "#D2B48C";
  ctx.beginPath();
  ctx.ellipse(0, hatY, size * 0.42, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dome of hat
  ctx.fillStyle = "#C4A672";
  ctx.beginPath();
  ctx.ellipse(0, hatY - size * 0.08, size * 0.26, size * 0.16, 0, Math.PI, 0);
  ctx.fill();

  // Hat band
  ctx.fillStyle = "#8B6914";
  ctx.fillRect(-size * 0.26, hatY - size * 0.04, size * 0.52, size * 0.04);

  // Top button
  ctx.fillStyle = "#A0884A";
  ctx.beginPath();
  ctx.arc(0, hatY - size * 0.22, size * 0.04, 0, Math.PI * 2);
  ctx.fill();

  // Brim shadow
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.beginPath();
  ctx.ellipse(0, hatY + size * 0.02, size * 0.38, size * 0.04, 0, 0, Math.PI);
  ctx.fill();
}

function drawSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  frame: number
) {
  const pulse = 1 + Math.sin(frame * 0.1) * 0.15;
  const s = size * pulse;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  const points = 4;
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? s : s * 0.3;
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = "#FFD700";
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.restore();
}

// --- Draw shopkeeper ---
function drawShopkeeper(
  ctx: CanvasRenderingContext2D,
  shop: Shop,
  frame: number,
  playerScore: number
) {
  const { x, y } = shop;
  ctx.save();
  ctx.translate(x, y);

  // Shop stand / table
  ctx.fillStyle = "#8B5E3C";
  ctx.fillRect(-35, 5, 70, 20);
  // Table legs
  ctx.fillRect(-30, 25, 6, 15);
  ctx.fillRect(24, 25, 6, 15);
  // Table top highlight
  ctx.fillStyle = "#A0714F";
  ctx.fillRect(-35, 5, 70, 4);

  // Awning / roof
  ctx.fillStyle = "#C0392B";
  ctx.beginPath();
  ctx.moveTo(-45, -45);
  ctx.lineTo(45, -45);
  ctx.lineTo(40, -30);
  ctx.lineTo(-40, -30);
  ctx.closePath();
  ctx.fill();
  // Stripes on awning
  ctx.fillStyle = "#E74C3C";
  for (let i = -40; i < 40; i += 16) {
    ctx.fillRect(i, -45, 8, 15);
  }
  // Awning poles
  ctx.fillStyle = "#6B4226";
  ctx.fillRect(-38, -30, 4, 55);
  ctx.fillRect(34, -30, 4, 55);

  // Shopkeeper body (friendly Claude - green/blue tint)
  const size = PLAYER_SIZE * 0.85;
  const bw = size * 0.6;
  const bh = size * 0.7;
  const bx = -bw / 2;
  const by = -bh - 8;

  ctx.fillStyle = "#7B4AAA";
  ctx.beginPath();
  const radius = bw * 0.3;
  ctx.moveTo(bx + radius, by);
  ctx.lineTo(bx + bw - radius, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
  ctx.lineTo(bx + bw, by + bh - radius);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
  ctx.lineTo(bx + radius, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
  ctx.lineTo(bx, by + radius);
  ctx.quadraticCurveTo(bx, by, bx + radius, by);
  ctx.closePath();
  ctx.fill();

  // Friendly eyes
  const eyeY = by + bh * 0.35;
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.ellipse(-4, eyeY, 3, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(4, eyeY, 3, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1A1A2E";
  ctx.beginPath();
  ctx.arc(-4, eyeY, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(4, eyeY, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Happy smile
  ctx.strokeStyle = "#1A1A2E";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, eyeY + 6, 4, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // Merchant hat (top hat)
  ctx.fillStyle = "#2C3E50";
  ctx.fillRect(-8, by - 14, 16, 14);
  ctx.fillRect(-11, by - 2, 22, 4);

  // "SHOP" sign floating above
  const bob = Math.sin(frame * 0.04) * 2;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(-22, -68 + bob, 44, 18);
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.fillText("BUTIK", 0, -54 + bob);
  ctx.textAlign = "start";

  // Display items on table
  let ix = -22;
  for (const item of shop.items) {
    if (item.sold) {
      ix += 22;
      continue;
    }
    if (item.type === "heart") {
      ctx.fillStyle = "#FF4444";
      ctx.font = "14px serif";
      ctx.fillText("♥", ix, 2);
    } else if (item.type === "weapon" && item.weaponType) {
      // Mini weapon icon
      ctx.fillStyle = "#C0C0C0";
      if (item.weaponType === "sword") {
        ctx.fillRect(ix + 2, -8, 3, 14);
        ctx.fillStyle = "#DAA520";
        ctx.fillRect(ix - 1, 4, 9, 2);
      } else if (item.weaponType === "axe") {
        ctx.fillStyle = "#8B4513";
        ctx.fillRect(ix + 3, -4, 3, 12);
        ctx.fillStyle = "#808080";
        ctx.fillRect(ix - 1, -6, 8, 6);
      } else {
        ctx.fillStyle = "#8B4513";
        ctx.fillRect(ix + 3, -2, 3, 12);
        ctx.fillStyle = "#696969";
        ctx.fillRect(ix, -6, 10, 6);
      }
    }
    ix += 22;
  }

  // Show shop menu if active
  if (shop.active) {
    ctx.save();
    // Menu background
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(-90, -140, 180, 80);
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.strokeRect(-90, -140, 180, 80);

    ctx.font = "11px monospace";
    let my = -125;
    for (let i = 0; i < shop.items.length; i++) {
      const item = shop.items[i];
      if (item.sold) {
        ctx.fillStyle = "#555";
        ctx.fillText(`  ${item.name} - SOLGT`, -82, my);
      } else {
        const canAfford = playerScore >= item.cost;
        const selected = i === shop.selectedIndex;
        ctx.fillStyle = selected ? "#FFD700" : canAfford ? "#FFF" : "#888";
        const arrow = selected ? "▸ " : "  ";
        ctx.fillText(`${arrow}${item.name} - ${item.cost}p`, -82, my);
      }
      my += 16;
    }

    ctx.fillStyle = "#AAA";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("I/K: Vælg · X: Køb · Z: Luk", 0, -65);
    ctx.textAlign = "start";

    ctx.restore();
  }

  ctx.restore();
}

// --- Level generation ---
function generateLevel() {
  const platforms: Platform[] = [];
  const obstacles: Obstacle[] = [];
  const coins: Coin[] = [];
  const enemies: Enemy[] = [];
  const weapons: Weapon[] = [];
  const shops: Shop[] = [];

  // Ground
  for (let i = 0; i < 60; i++) {
    if (i === 12 || i === 13 || i === 25 || i === 26 || i === 40 || i === 41) continue;
    platforms.push({
      x: i * 150,
      y: GROUND_Y,
      width: 150,
      height: 60,
      color: "#C2A366",
    });
  }

  // Floating platforms
  const floatingPlatforms = [
    { x: 300, y: GROUND_Y - 100, width: 120 },
    { x: 550, y: GROUND_Y - 160, width: 100 },
    { x: 800, y: GROUND_Y - 80, width: 150 },
    { x: 1100, y: GROUND_Y - 130, width: 100 },
    { x: 1400, y: GROUND_Y - 180, width: 120 },
    { x: 1700, y: GROUND_Y - 100, width: 100 },
    { x: 1750, y: GROUND_Y - 60, width: 120 },
    { x: 2000, y: GROUND_Y - 140, width: 100 },
    { x: 2300, y: GROUND_Y - 100, width: 130 },
    { x: 2600, y: GROUND_Y - 170, width: 110 },
    { x: 2900, y: GROUND_Y - 90, width: 140 },
    { x: 3200, y: GROUND_Y - 150, width: 100 },
    { x: 3500, y: GROUND_Y - 120, width: 120 },
    { x: 3700, y: GROUND_Y - 60, width: 150 },
    { x: 3900, y: GROUND_Y - 180, width: 100 },
    { x: 5900, y: GROUND_Y - 60, width: 150 },
    { x: 6050, y: GROUND_Y - 60, width: 150 },
  ];

  for (const p of floatingPlatforms) {
    platforms.push({ ...p, height: 16, color: "#8B5E3C" });
  }

  // Obstacles
  const obstaclePositions = [
    { x: 500, w: 30, h: 40 },
    { x: 1300, w: 35, h: 35 },
    { x: 2400, w: 30, h: 40 },
    { x: 3300, w: 35, h: 40 },
    { x: 4200, w: 30, h: 45 },
    { x: 5200, w: 30, h: 50 },
  ];

  for (const o of obstaclePositions) {
    obstacles.push({
      x: o.x,
      y: GROUND_Y - o.h,
      width: o.w,
      height: o.h,
      color: "#C0392B",
    });
  }

  // Coins
  const coinPositions = [
    { x: 350, y: GROUND_Y - 140 },
    { x: 580, y: GROUND_Y - 200 },
    { x: 700, y: GROUND_Y - 40 },
    { x: 850, y: GROUND_Y - 120 },
    { x: 1050, y: GROUND_Y - 40 },
    { x: 1150, y: GROUND_Y - 170 },
    { x: 1450, y: GROUND_Y - 220 },
    { x: 1600, y: GROUND_Y - 40 },
    { x: 2050, y: GROUND_Y - 180 },
    { x: 2350, y: GROUND_Y - 140 },
    { x: 2650, y: GROUND_Y - 210 },
    { x: 2950, y: GROUND_Y - 130 },
    { x: 3250, y: GROUND_Y - 190 },
    { x: 3550, y: GROUND_Y - 160 },
    { x: 3750, y: GROUND_Y - 100 },
    { x: 3950, y: GROUND_Y - 220 },
    { x: 4300, y: GROUND_Y - 40 },
    { x: 4600, y: GROUND_Y - 40 },
    { x: 5000, y: GROUND_Y - 40 },
    { x: 5400, y: GROUND_Y - 40 },
  ];

  for (const c of coinPositions) {
    coins.push({ ...c, collected: false });
  }

  // Weapons on the ground
  const weaponTypes: WeaponType[] = ["sword", "axe", "hammer"];
  weapons.push({ x: 250, y: GROUND_Y - 15, type: "sword", onGround: true });
  weapons.push({ x: 1500, y: GROUND_Y - 15, type: "axe", onGround: true });
  weapons.push({ x: 2700, y: GROUND_Y - 15, type: "hammer", onGround: true });
  weapons.push({ x: 4000, y: GROUND_Y - 15, type: "sword", onGround: true });

  // Enemies (viking Claudes!)
  const enemyPositions = [
    { x: 650, weapon: "axe" as WeaponType },
    { x: 1000, weapon: "sword" as WeaponType },
    { x: 1600, weapon: "hammer" as WeaponType },
    { x: 2100, weapon: "axe" as WeaponType },
    { x: 2500, weapon: "sword" as WeaponType },
    { x: 3000, weapon: "hammer" as WeaponType },
    { x: 3400, weapon: "axe" as WeaponType },
    { x: 3900, weapon: "sword" as WeaponType },
    { x: 4500, weapon: "hammer" as WeaponType },
    { x: 5100, weapon: "axe" as WeaponType },
    { x: 5500, weapon: "sword" as WeaponType },
  ];

  for (const e of enemyPositions) {
    enemies.push({
      x: e.x,
      y: GROUND_Y - PLAYER_SIZE * 0.4,
      vy: 0,
      facing: -1,
      onGround: true,
      hp: 3,
      attackTimer: 0,
      attackCooldown: 0,
      weaponType: e.weapon,
      dead: false,
      deathTimer: 0,
    });
  }

  // Shops
  shops.push({
    x: 450,
    y: GROUND_Y - 40,
    items: [
      { name: "Hjerte", type: "heart", cost: 30, sold: false },
      { name: "Sværd", type: "weapon", weaponType: "sword", cost: 50, sold: false },
      { name: "Økse", type: "weapon", weaponType: "axe", cost: 60, sold: false },
    ],
    selectedIndex: 0,
    active: false,
  });

  shops.push({
    x: 2200,
    y: GROUND_Y - 40,
    items: [
      { name: "Hjerte", type: "heart", cost: 40, sold: false },
      { name: "Hjerte", type: "heart", cost: 40, sold: false },
      { name: "Hammer", type: "weapon", weaponType: "hammer", cost: 80, sold: false },
    ],
    selectedIndex: 0,
    active: false,
  });

  shops.push({
    x: 4400,
    y: GROUND_Y - 40,
    items: [
      { name: "Hjerte", type: "heart", cost: 50, sold: false },
      { name: "Sværd+", type: "weapon", weaponType: "sword", cost: 100, sold: false },
      { name: "Økse+", type: "weapon", weaponType: "axe", cost: 120, sold: false },
    ],
    selectedIndex: 0,
    active: false,
  });

  // Power-up area before boss - weapon and hearts
  weapons.push({ x: 7800, y: GROUND_Y - 15, type: "sword", onGround: true });
  weapons.push({ x: 7850, y: GROUND_Y - 15, type: "axe", onGround: true });
  weapons.push({ x: 7900, y: GROUND_Y - 15, type: "hammer", onGround: true });
  coins.push({ x: 7700, y: GROUND_Y - 40, collected: false });
  coins.push({ x: 7750, y: GROUND_Y - 40, collected: false });
  coins.push({ x: 7800, y: GROUND_Y - 40, collected: false });
  coins.push({ x: 7850, y: GROUND_Y - 40, collected: false });
  coins.push({ x: 7900, y: GROUND_Y - 40, collected: false });
  coins.push({ x: 7950, y: GROUND_Y - 40, collected: false });

  // Boss - giant viking Claude at the end
  const boss: Boss = {
    x: 8200,
    y: GROUND_Y - PLAYER_SIZE * 0.6 - 5,
    vy: 0,
    facing: -1,
    onGround: true,
    hp: 15,
    maxHp: 15,
    attackTimer: 0,
    attackCooldown: 0,
    dead: false,
    deathTimer: 0,
    phase: 1,
  };

  return { platforms, obstacles, coins, enemies, weapons, shops, boss };
}

// --- Main Game Component ---
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const justPressedRef = useRef<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Handle fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);
  const gameStateRef = useRef<{
    player: Player;
    camera: number;
    platforms: Platform[];
    obstacles: Obstacle[];
    coins: Coin[];
    enemies: Enemy[];
    weapons: Weapon[];
    shops: Shop[];
    boss: Boss;
    doorOpen: boolean;
    won: boolean;
    checkpoint: number; // x position of last checkpoint
    score: number;
    frame: number;
    gameOver: boolean;
    clouds: { x: number; y: number; size: number }[];
    jetpackFlying: boolean;
    jetpackAnnounce: number; // countdown for "JETPACK!" text
  } | null>(null);

  const initGame = useCallback(() => {
    const { platforms, obstacles, coins, enemies, weapons, shops, boss } = generateLevel();
    const clouds = [];
    for (let i = 0; i < 30; i++) {
      clouds.push({
        x: Math.random() * 9000,
        y: 30 + Math.random() * 120,
        size: 30 + Math.random() * 50,
      });
    }
    gameStateRef.current = {
      player: {
        x: 100,
        y: GROUND_Y - PLAYER_SIZE,
        vy: 0,
        vx: 0,
        onGround: false,
        facing: 1,
        weapon: "hammer",
        attackTimer: 0,
        hp: 5,
        invincible: 0,
        jumpsLeft: 2,
        hasJetpack: false,
        jetpackFuel: 0,
        minigunCooldown: 0,
        bullets: [],
      },
      camera: 0,
      platforms,
      obstacles,
      coins,
      enemies,
      weapons,
      shops,
      boss,
      doorOpen: false,
      won: false,
      checkpoint: 100,
      score: 0,
      frame: 0,
      gameOver: false,
      clouds,
      jetpackFlying: false,
      jetpackAnnounce: 0,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    initGame();

    let musicStarted = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!musicStarted) {
        startMusic();
        musicStarted = true;
      }
      if (!keysRef.current.has(e.key)) {
        justPressedRef.current.add(e.key);
      }
      keysRef.current.add(e.key);
      if (e.key === " ") {
        e.preventDefault();
      }
      if (e.key === "r" && gameStateRef.current?.won) {
        initGame();
      }
      if (e.key === "r" && gameStateRef.current?.gameOver) {
        const state = gameStateRef.current;
        // Respawn at checkpoint
        state.player.x = state.checkpoint;
        state.player.y = GROUND_Y - PLAYER_SIZE;
        state.player.vy = 0;
        state.player.vx = 0;
        state.player.hp = 5;
        state.player.invincible = 120;
        state.player.onGround = false;
        state.player.jumpsLeft = 2;
        state.player.attackTimer = 0;
        state.player.bullets = [];
        state.gameOver = false;
        // Reset boss if it killed us (but keep damage done)
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    let animId: number;

    function update() {
      const state = gameStateRef.current;
      if (!state || state.gameOver || state.won) return;

      const keys = keysRef.current;
      const justPressed = justPressedRef.current;
      const { player } = state;

      state.frame++;

      // Decrease invincibility
      if (player.invincible > 0) player.invincible--;

      // Decrease attack timer
      if (player.attackTimer > 0) player.attackTimer--;

      // Shop interaction (checked before movement so it blocks controls)
      for (const shop of state.shops) {
        const distToShop = Math.abs(player.x - shop.x);
        const near = distToShop < 50 && Math.abs(player.y - shop.y) < 60;

        if (shop.active) {
          // Navigate menu with I/K (up/down)
          if (justPressed.has("i") || justPressed.has("I")) {
            do {
              shop.selectedIndex = (shop.selectedIndex - 1 + shop.items.length) % shop.items.length;
            } while (shop.items[shop.selectedIndex].sold && shop.items.some((it) => !it.sold));
          }
          if (justPressed.has("k") || justPressed.has("K")) {
            do {
              shop.selectedIndex = (shop.selectedIndex + 1) % shop.items.length;
            } while (shop.items[shop.selectedIndex].sold && shop.items.some((it) => !it.sold));
          }

          // Buy with X
          if (justPressed.has("x") || justPressed.has("X")) {
            const item = shop.items[shop.selectedIndex];
            if (!item.sold && state.score >= item.cost) {
              state.score -= item.cost;
              item.sold = true;
              if (item.type === "heart") {
                player.hp = Math.min(player.hp + 1, 10);
              } else if (item.type === "weapon" && item.weaponType) {
                if (player.weapon) {
                  state.weapons.push({
                    x: player.x + player.facing * 20,
                    y: GROUND_Y - 15,
                    type: player.weapon,
                    onGround: true,
                  });
                }
                player.weapon = item.weaponType;
              }
              playCoinPling();
            }
          }

          // Close shop with Z or walking away
          if ((justPressed.has("z") || justPressed.has("Z")) || !near) {
            shop.active = false;
          }
        } else if (near && (justPressed.has("x") || justPressed.has("X"))) {
          shop.active = true;
          shop.selectedIndex = 0;
          for (let i = 0; i < shop.items.length; i++) {
            if (!shop.items[i].sold) { shop.selectedIndex = i; break; }
          }
        }
      }

      // If shop is open, freeze player and skip rest of update
      if (state.shops.some((s) => s.active)) {
        player.vx = 0;
        justPressedRef.current.clear();
        return;
      }

      // Movement (JKLI)
      player.vx = 0;
      if (keys.has("l") || keys.has("L")) {
        player.vx = MOVE_SPEED;
        player.facing = 1;
      }
      if (keys.has("j") || keys.has("J")) {
        player.vx = -MOVE_SPEED;
        player.facing = -1;
      }

      // Pick up weapon with "X"
      if (justPressed.has("x") || justPressed.has("X")) {
        // Try to pick up nearby weapon
        let closestWeapon: Weapon | null = null;
        let closestDist = 40;
        for (const w of state.weapons) {
          if (!w.onGround) continue;
          const dist = Math.abs(player.x - w.x) + Math.abs(player.y - w.y);
          if (dist < closestDist) {
            closestDist = dist;
            closestWeapon = w;
          }
        }
        if (closestWeapon) {
          // Drop current weapon if holding one
          if (player.weapon) {
            state.weapons.push({
              x: player.x,
              y: GROUND_Y - 15,
              type: player.weapon,
              onGround: true,
            });
          }
          player.weapon = closestWeapon.type;
          closestWeapon.onGround = false;
          playPickup();
        }
      }

      // Attack with Z key
      if (
        (justPressed.has("z") || justPressed.has("Z")) &&
        player.weapon &&
        player.attackTimer <= 0
      ) {
        player.attackTimer = ATTACK_DURATION;
        playSwing();
      }

      // Jump (double jump)
      if (
        (justPressed.has("i") || justPressed.has("I") || justPressed.has(" ")) &&
        player.jumpsLeft > 0
      ) {
        player.vy = JUMP_FORCE;
        player.onGround = false;
        player.jumpsLeft--;
        playJump();
      }

      // Apply gravity
      player.vy += GRAVITY;
      player.x += player.vx;
      player.y += player.vy;

      if (player.x < 0) player.x = 0;

      // Platform collision for player
      player.onGround = false;
      for (const plat of state.platforms) {
        if (
          player.x + PLAYER_SIZE * 0.3 > plat.x &&
          player.x - PLAYER_SIZE * 0.3 < plat.x + plat.width &&
          player.y + PLAYER_SIZE * 0.4 >= plat.y &&
          player.y + PLAYER_SIZE * 0.4 - player.vy <= plat.y &&
          player.vy >= 0
        ) {
          player.y = plat.y - PLAYER_SIZE * 0.4;
          player.vy = 0;
          player.onGround = true;
          player.jumpsLeft = 2;
          if (player.vx !== 0 && plat.height > 20) {
            playGrassStep();
          }
        }
      }

      // Fall into pit — instant death
      if (player.y > CANVAS_HEIGHT + 50) {
        state.gameOver = true;
        playDeath();
      }

      // Obstacle collision
      for (const obs of state.obstacles) {
        const px = player.x;
        const py = player.y;
        const halfW = PLAYER_SIZE * 0.25;
        const halfH = PLAYER_SIZE * 0.35;
        if (
          px + halfW > obs.x &&
          px - halfW < obs.x + obs.width &&
          py + halfH > obs.y &&
          py - halfH < obs.y + obs.height
        ) {
          state.gameOver = true;
          playDeath();
        }
      }

      // Player attack hits enemies
      if (player.attackTimer === ATTACK_DURATION - 1 && player.weapon) {
        for (const enemy of state.enemies) {
          if (enemy.dead) continue;
          const dx = enemy.x - player.x;
          const dy = Math.abs(enemy.y - player.y);
          if (
            dy < 30 &&
            Math.sign(dx) === player.facing &&
            Math.abs(dx) < ATTACK_RANGE
          ) {
            enemy.hp--;
            // Knockback enemy away from player
            const knockDir = dx > 0 ? 1 : -1;
            enemy.x += knockDir * 30;
            enemy.vy = -5; // Pop up slightly
            playHit();
            if (enemy.hp <= 0) {
              enemy.dead = true;
              enemy.deathTimer = 0;
              state.score += 50;
              // Drop weapon
              state.weapons.push({
                x: enemy.x,
                y: GROUND_Y - 15,
                type: enemy.weaponType,
                onGround: true,
              });
            }
          }
        }
      }

      // Update enemies
      for (const enemy of state.enemies) {
        if (enemy.dead) {
          enemy.deathTimer++;
          continue;
        }

        // Gravity for enemy
        enemy.vy += GRAVITY;
        enemy.y += enemy.vy;

        // Enemy platform collision
        enemy.onGround = false;
        for (const plat of state.platforms) {
          if (
            enemy.x + PLAYER_SIZE * 0.3 > plat.x &&
            enemy.x - PLAYER_SIZE * 0.3 < plat.x + plat.width &&
            enemy.y + PLAYER_SIZE * 0.4 >= plat.y &&
            enemy.y + PLAYER_SIZE * 0.4 - enemy.vy <= plat.y &&
            enemy.vy >= 0
          ) {
            enemy.y = plat.y - PLAYER_SIZE * 0.4;
            enemy.vy = 0;
            enemy.onGround = true;
          }
        }

        // Fall into pit — enemy dies
        if (enemy.y > CANVAS_HEIGHT + 50) {
          enemy.dead = true;
          enemy.deathTimer = 0;
          state.score += 25;
        }

        // Enemy AI: chase player if close
        const distToPlayer = player.x - enemy.x;
        const absDist = Math.abs(distToPlayer);

        if (absDist < ENEMY_AGGRO_RANGE) {
          enemy.facing = distToPlayer > 0 ? 1 : -1;

          if (absDist > ENEMY_ATTACK_RANGE) {
            // Move toward player
            enemy.x += enemy.facing * ENEMY_SPEED;
          }

          // Attack
          if (enemy.attackCooldown > 0) {
            enemy.attackCooldown--;
          }
          if (enemy.attackTimer > 0) {
            enemy.attackTimer--;
          }

          if (
            absDist < ENEMY_ATTACK_RANGE &&
            enemy.attackTimer <= 0 &&
            enemy.attackCooldown <= 0
          ) {
            enemy.attackTimer = ENEMY_ATTACK_DURATION;
            enemy.attackCooldown = ENEMY_ATTACK_COOLDOWN;
          }

          // Enemy attack hits player
          if (enemy.attackTimer === ENEMY_ATTACK_DURATION - 5 && player.invincible <= 0) {
            const edx = player.x - enemy.x;
            if (Math.abs(edx) < ENEMY_ATTACK_RANGE + 10 && Math.abs(player.y - enemy.y) < 30) {
              player.hp--;
              player.invincible = 60; // 1 second invincibility
              // Knockback - fly away from enemy
              const knockDir = edx >= 0 ? 1 : -1;
              player.vx = knockDir * 10;
              player.x += knockDir * 15;
              player.vy = -8;
              player.onGround = false;
              playHit();
              if (player.hp <= 0) {
                state.gameOver = true;
                playDeath();
              }
            }
          }
        }
      }

      // Checkpoint at halfway
      if (player.x >= 4250 && state.checkpoint < 4250) {
        state.checkpoint = 4250;
        playCoinPling();
      }

      // Jetpack announcement countdown
      if (state.jetpackAnnounce > 0) state.jetpackAnnounce--;

      // Jetpack & minigun logic
      if (player.hasJetpack) {
        // Jetpack: hold I/space to fly up
        const wantsToFly = keys.has("i") || keys.has("I") || keys.has(" ");
        state.jetpackFlying = wantsToFly && player.jetpackFuel > 0;
        if (wantsToFly) {
          if (player.jetpackFuel > 0) {
            player.vy = Math.max(player.vy - 1.2, -8);
            player.jetpackFuel -= 0.5;
          }
        }
        // Refuel slowly on ground
        if (player.onGround) {
          player.jetpackFuel = Math.min(player.jetpackFuel + 2, 200);
        }

        // Minigun: Z to shoot
        if (player.minigunCooldown > 0) player.minigunCooldown--;
        if (keys.has("z") || keys.has("Z")) {
          if (player.minigunCooldown <= 0) {
            player.bullets.push({
              x: player.x + player.facing * 20,
              y: player.y - 5,
              vx: player.facing * 14,
            });
            player.minigunCooldown = 4;
            // Minigun sound - quick tick
            playSwing();
          }
        }

        // Update bullets
        for (let i = player.bullets.length - 1; i >= 0; i--) {
          const b = player.bullets[i];
          b.x += b.vx;
          // Hit boss
          const boss = state.boss;
          if (!boss.dead && Math.abs(b.x - boss.x) < 30 && Math.abs(b.y - boss.y) < 40) {
            boss.hp -= 0.5;
            player.bullets.splice(i, 1);
            playHit();
            if (boss.hp <= 0) {
              boss.dead = true;
              boss.deathTimer = 0;
              state.score += 200;
              state.doorOpen = true;
            }
            continue;
          }
          // Remove off-screen bullets
          if (Math.abs(b.x - player.x) > CANVAS_WIDTH) {
            player.bullets.splice(i, 1);
          }
        }
      }

      // Boss update
      const boss = state.boss;
      if (!boss.dead) {
        // Gravity
        boss.vy += GRAVITY;
        boss.y += boss.vy;
        boss.onGround = false;
        for (const plat of state.platforms) {
          if (
            boss.x + PLAYER_SIZE * 0.5 > plat.x &&
            boss.x - PLAYER_SIZE * 0.5 < plat.x + plat.width &&
            boss.y + PLAYER_SIZE * 0.6 >= plat.y &&
            boss.y + PLAYER_SIZE * 0.6 - boss.vy <= plat.y &&
            boss.vy >= 0
          ) {
            boss.y = plat.y - PLAYER_SIZE * 0.6;
            boss.vy = 0;
            boss.onGround = true;
          }
        }

        // Boss falls into pit — instant death
        if (boss.y > CANVAS_HEIGHT + 50) {
          boss.dead = true;
          boss.deathTimer = 0;
          state.score += 200;
          state.doorOpen = true;
        }

        // Boss AI - more aggressive, phases
        const bossDistToPlayer = player.x - boss.x;
        const bossAbsDist = Math.abs(bossDistToPlayer);
        boss.phase = boss.hp <= 5 ? 3 : boss.hp <= 10 ? 2 : 1;
        const bossSpeed = ENEMY_SPEED * (0.8 + boss.phase * 0.4);
        const bossAggroRange = 400 + boss.phase * 100;

        if (bossAbsDist < bossAggroRange) {
          boss.facing = bossDistToPlayer > 0 ? 1 : -1;

          if (bossAbsDist > ENEMY_ATTACK_RANGE) {
            boss.x += boss.facing * bossSpeed;
          }

          // Boss jump in phase 2+
          if (boss.phase >= 2 && boss.onGround && bossAbsDist < 200 && Math.random() < 0.01) {
            boss.vy = JUMP_FORCE * 0.8;
            boss.onGround = false;
          }

          if (boss.attackCooldown > 0) boss.attackCooldown--;
          if (boss.attackTimer > 0) boss.attackTimer--;

          const bossCooldown = Math.max(40, ENEMY_ATTACK_COOLDOWN + 20 - boss.phase * 10);
          if (bossAbsDist < ENEMY_ATTACK_RANGE + 10 && boss.attackTimer <= 0 && boss.attackCooldown <= 0) {
            boss.attackTimer = ENEMY_ATTACK_DURATION;
            boss.attackCooldown = bossCooldown;
          }

          // Boss hits player
          if (boss.attackTimer === ENEMY_ATTACK_DURATION - 5 && player.invincible <= 0) {
            const bdx = player.x - boss.x;
            if (Math.abs(bdx) < ENEMY_ATTACK_RANGE + 15 && Math.abs(player.y - boss.y) < 40) {
              player.hp -= 1;
              player.invincible = 90; // longer invincibility vs boss
              const knockDir = bdx >= 0 ? 1 : -1;
              player.vx = knockDir * 12;
              player.x += knockDir * 20;
              player.vy = -10;
              player.onGround = false;
              playHit();
              if (player.hp <= 0) {
                state.gameOver = true;
                playDeath();
              }
            }
          }
        }

        // Player hits boss
        if (player.attackTimer === ATTACK_DURATION - 1 && player.weapon) {
          const dx = boss.x - player.x;
          const dy = Math.abs(boss.y - player.y);
          if (dy < 40 && Math.sign(dx) === player.facing && Math.abs(dx) < ATTACK_RANGE + 10) {
            boss.hp--;
            // Knockback boss away from player
            const knockDir = dx > 0 ? 1 : -1;
            boss.x += knockDir * 25;
            boss.attackCooldown = Math.max(boss.attackCooldown, 40); // Reset cooldown so boss can't hit back instantly
            // Knockback boss more
            const bkDir = dx > 0 ? 1 : -1;
            boss.x += bkDir * 10;
            playHit();
            // At half HP - give player jetpack + minigun!
            if (boss.hp <= boss.maxHp / 2 && !player.hasJetpack) {
              player.hasJetpack = true;
              player.jetpackFuel = 200;
              player.minigunCooldown = 0;
              state.jetpackAnnounce = 120; // Show "JETPACK!" for 2 seconds
            }
            if (boss.hp <= 0) {
              boss.dead = true;
              boss.deathTimer = 0;
              state.score += 200;
              state.doorOpen = true;
            }
          }
        }
      } else {
        boss.deathTimer++;
      }

      // Win condition - reach the door after boss is dead
      if (state.doorOpen && !state.won) {
        const doorX = 8500;
        if (Math.abs(player.x - doorX) < 40) {
          state.won = true;
        }
      }

      // Coin collection
      for (const coin of state.coins) {
        if (coin.collected) continue;
        const dx = player.x - coin.x;
        const dy = player.y - coin.y;
        if (Math.sqrt(dx * dx + dy * dy) < 25) {
          coin.collected = true;
          state.score += 10;
          playCoinPling();
        }
      }

      // Fall off screen
      if (player.y > CANVAS_HEIGHT + 50) {
        state.gameOver = true;
        playDeath();
      }

      // Camera follows player
      const targetCam = player.x - SCROLL_THRESHOLD;
      if (targetCam > state.camera) {
        state.camera += (targetCam - state.camera) * 0.1;
      } else if (targetCam < state.camera - 100) {
        state.camera += (targetCam - state.camera + 100) * 0.1;
      }
      if (state.camera < 0) state.camera = 0;

      // Clear justPressed
      justPressedRef.current.clear();
    }

    function draw() {
      if (!ctx) return;
      const state = gameStateRef.current;
      if (!state) return;

      const cam = state.camera;

      // Safari sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      skyGrad.addColorStop(0, "#F4A460");
      skyGrad.addColorStop(0.3, "#FFDAB9");
      skyGrad.addColorStop(0.6, "#FFF8DC");
      skyGrad.addColorStop(1, "#DEB887");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Sun
      ctx.fillStyle = "#FFD700";
      ctx.shadowColor = "#FFD700";
      ctx.shadowBlur = 40;
      ctx.beginPath();
      ctx.arc(CANVAS_WIDTH - 80, 60, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Clouds (parallax)
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      for (const cloud of state.clouds) {
        const cx = cloud.x - cam * 0.3;
        const wrappedX =
          ((cx % (CANVAS_WIDTH + 200)) + CANVAS_WIDTH + 200) %
            (CANVAS_WIDTH + 200) -
          100;
        drawCloud(ctx, wrappedX, cloud.y, cloud.size);
      }

      // Savanna hills (parallax background)
      drawSavannaHills(ctx, cam);

      // Safari animals in background (parallax)
      drawSafariAnimals(ctx, cam, state.frame);

      ctx.save();
      ctx.translate(-cam, 0);

      // Platforms
      for (const plat of state.platforms) {
        if (plat.x + plat.width < cam - 50 || plat.x > cam + CANVAS_WIDTH + 50)
          continue;
        ctx.fillStyle = plat.color;
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        if (plat.height > 20) {
          // Sand dunes / hills on top of ground
          ctx.fillStyle = "#D4B06A";
          ctx.beginPath();
          ctx.moveTo(plat.x, plat.y + 4);
          for (let hx = 0; hx <= plat.width; hx += 10) {
            const worldHx = plat.x + hx;
            const hillH = Math.sin(worldHx * 0.025) * 8 + Math.sin(worldHx * 0.06) * 4 + Math.sin(worldHx * 0.11) * 2;
            ctx.lineTo(plat.x + hx, plat.y - hillH);
          }
          ctx.lineTo(plat.x + plat.width, plat.y + 4);
          ctx.closePath();
          ctx.fill();

          // Lighter sand highlights on hill tops
          ctx.fillStyle = "#E0C888";
          ctx.beginPath();
          ctx.moveTo(plat.x, plat.y + 2);
          for (let hx = 0; hx <= plat.width; hx += 10) {
            const worldHx = plat.x + hx;
            const hillH = Math.sin(worldHx * 0.025) * 8 + Math.sin(worldHx * 0.06) * 4 + Math.sin(worldHx * 0.11) * 2;
            ctx.lineTo(plat.x + hx, plat.y - hillH + 2);
          }
          ctx.lineTo(plat.x + plat.width, plat.y + 2);
          ctx.closePath();
          ctx.fill();

          // Small tufts of dry grass on hills
          ctx.strokeStyle = "#9B8B3A";
          ctx.lineWidth = 1;
          for (let g = 0; g < 3; g++) {
            const gx = plat.x + ((g * 47 + plat.x * 3) % plat.width);
            const gy = plat.y - (Math.sin(gx * 0.025) * 8 + Math.sin(gx * 0.06) * 4 + Math.sin(gx * 0.11) * 2);
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx - 3, gy - 6);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx + 2, gy - 7);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.lineTo(gx + 4, gy - 5);
            ctx.stroke();
          }
        }
        if (plat.height <= 20) {
          ctx.fillStyle = "#A0714F";
          ctx.fillRect(plat.x + 4, plat.y + 3, plat.width - 8, 4);
        }
      }

      // Checkpoint flag at x=4250
      const cpX = 4250;
      if (cpX > cam - 50 && cpX < cam + CANVAS_WIDTH + 50) {
        // Flag pole
        ctx.fillStyle = "#8B4513";
        ctx.fillRect(cpX - 2, GROUND_Y - 60, 4, 60);
        // Flag
        const flagWave = Math.sin(state.frame * 0.08) * 3;
        ctx.fillStyle = state.checkpoint >= 4250 ? "#4CAF50" : "#FF9800";
        ctx.beginPath();
        ctx.moveTo(cpX + 2, GROUND_Y - 58);
        ctx.lineTo(cpX + 25 + flagWave, GROUND_Y - 50);
        ctx.lineTo(cpX + 2, GROUND_Y - 40);
        ctx.closePath();
        ctx.fill();
        // "CP" text
        ctx.fillStyle = "#FFF";
        ctx.font = "bold 8px monospace";
        ctx.fillText("CP", cpX + 6, GROUND_Y - 47);
      }

      // Obstacles
      for (const obs of state.obstacles) {
        if (obs.x + obs.width < cam - 50 || obs.x > cam + CANVAS_WIDTH + 50)
          continue;
        drawSpike(ctx, obs);
      }

      // Weapons on ground
      for (const w of state.weapons) {
        if (!w.onGround) continue;
        if (w.x < cam - 50 || w.x > cam + CANVAS_WIDTH + 50) continue;
        drawGroundWeapon(ctx, w, state.frame);
      }

      // Coins
      for (const coin of state.coins) {
        if (coin.collected) continue;
        if (coin.x < cam - 50 || coin.x > cam + CANVAS_WIDTH + 50) continue;
        drawCoin(ctx, coin.x, coin.y, state.frame);
      }

      // Shops
      for (const shop of state.shops) {
        if (shop.x < cam - 100 || shop.x > cam + CANVAS_WIDTH + 100) continue;
        drawShopkeeper(ctx, shop, state.frame, state.score);
      }

      // Enemies
      for (const enemy of state.enemies) {
        if (enemy.dead && enemy.deathTimer > 60) continue; // Fully faded
        if (enemy.x < cam - 100 || enemy.x > cam + CANVAS_WIDTH + 100) continue;
        drawEnemy(ctx, enemy, state.frame);
      }

      // Door and Princess
      const doorX = 8500;
      if (doorX > cam - 100 && doorX < cam + CANVAS_WIDTH + 100) {
        drawDoorAndPrincess(ctx, doorX, GROUND_Y, state.doorOpen, state.frame);
      }

      // Boss
      if (!state.boss.dead || state.boss.deathTimer < 80) {
        if (state.boss.x > cam - 100 && state.boss.x < cam + CANVAS_WIDTH + 100) {
          drawBoss(ctx, state.boss, state.frame);
        }
      }

      // Draw bullets
      if (state.player.bullets.length > 0) {
        for (const b of state.player.bullets) {
          ctx.fillStyle = "#FFD700";
          ctx.beginPath();
          ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
          ctx.fill();
          // Bullet trail
          ctx.fillStyle = "rgba(255, 200, 0, 0.4)";
          ctx.beginPath();
          ctx.arc(b.x - b.vx * 0.3, b.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Player
      drawClaude(
        ctx,
        state.player.x,
        state.player.y,
        PLAYER_SIZE,
        state.player.facing,
        state.player.onGround && state.player.vx !== 0,
        state.frame,
        state.player.weapon,
        state.player.attackTimer,
        state.player.invincible,
        state.player.hasJetpack,
        state.player.jetpackFuel,
        state.jetpackFlying
      );

      ctx.restore();

      // HUD
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(10, 10, 220, 45);

      // Score
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 18px monospace";
      ctx.fillText(`Score: ${state.score}`, 18, 35);

      // HP hearts
      for (let i = 0; i < 5; i++) {
        const hx = 140 + i * 18;
        const hy = 25;
        ctx.fillStyle = i < state.player.hp ? "#FF4444" : "#444";
        ctx.font = "14px serif";
        ctx.fillText("♥", hx, hy + 5);
      }

      // Weapon indicator
      if (state.player.weapon) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(10, 60, 120, 25);
        ctx.fillStyle = "#AAA";
        ctx.font = "13px monospace";
        ctx.fillText(`Våben: ${state.player.weapon}`, 18, 78);
      }

      // Jetpack fuel bar
      if (state.player.hasJetpack) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(10, 90, 120, 25);
        ctx.fillStyle = "#AAA";
        ctx.font = "11px monospace";
        ctx.fillText("Jetpack:", 16, 105);
        const fuelW = 55;
        const fuelRatio = state.player.jetpackFuel / 200;
        ctx.fillStyle = "#333";
        ctx.fillRect(72, 95, fuelW, 10);
        ctx.fillStyle = fuelRatio > 0.3 ? "#4CAF50" : "#FF5722";
        ctx.fillRect(72, 95, fuelW * fuelRatio, 10);
      }

      // Jetpack announcement
      if (state.jetpackAnnounce > 0) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 36px monospace";
        const alpha = Math.min(state.jetpackAnnounce / 30, 1);
        ctx.fillStyle = `rgba(255, 170, 0, ${alpha})`;
        ctx.shadowColor = "#FF6600";
        ctx.shadowBlur = 15;
        const yOff = (120 - state.jetpackAnnounce) * 0.3;
        ctx.fillText("JETPACK + MINIGUN!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60 - yOff);
        ctx.font = "18px monospace";
        ctx.fillText("Hold I for at flyve · Z for at skyde!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30 - yOff);
        ctx.shadowBlur = 0;
        ctx.textAlign = "start";
        ctx.restore();
      }

      // Controls hint
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.font = "11px monospace";
      if (state.player.hasJetpack) {
        ctx.fillText("I: Flyv · Z: Skyd", CANVAS_WIDTH - 145, CANVAS_HEIGHT - 10);
      } else {
        ctx.fillText("X: Saml op · Z: Slå", CANVAS_WIDTH - 165, CANVAS_HEIGHT - 10);
      }

      // Progress bar (top right)
      const totalDist = 8500; // door position
      const progress = Math.min(state.player.x / totalDist, 1);
      const barW = 140;
      const barH = 14;
      const barX = CANVAS_WIDTH - barW - 16;
      const barY = 16;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(barX - 4, barY - 4, barW + 8, barH + 22);
      ctx.fillStyle = "#333";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = "#4CAF50";
      ctx.fillRect(barX, barY, barW * progress, barH);
      ctx.fillStyle = "#AAA";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(progress * 100)}%`, barX + barW / 2, barY + barH + 14);
      ctx.textAlign = "start";

      // Boss HP bar
      if (!state.boss.dead && Math.abs(state.player.x - state.boss.x) < 500) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(CANVAS_WIDTH / 2 - 120, CANVAS_HEIGHT - 40, 240, 22);
        ctx.fillStyle = "#444";
        ctx.fillRect(CANVAS_WIDTH / 2 - 116, CANVAS_HEIGHT - 37, 232, 16);
        const hpRatio = state.boss.hp / state.boss.maxHp;
        const barColor = hpRatio > 0.5 ? "#C0392B" : hpRatio > 0.25 ? "#E67E22" : "#E74C3C";
        ctx.fillStyle = barColor;
        ctx.fillRect(CANVAS_WIDTH / 2 - 116, CANVAS_HEIGHT - 37, 232 * hpRatio, 16);
        ctx.fillStyle = "#FFF";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("VIKING BOSS", CANVAS_WIDTH / 2, CANVAS_HEIGHT - 26);
        ctx.textAlign = "start";
      }

      // Win screen
      if (state.won) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        // Golden glow
        ctx.fillStyle = "rgba(255, 215, 0, 0.15)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "#FFD700";
        ctx.font = "bold 52px monospace";
        ctx.textAlign = "center";
        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = 20;
        ctx.fillText("DU VANDT!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#FFF";
        ctx.font = "24px monospace";
        ctx.fillText(`Score: ${state.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);
        ctx.font = "16px monospace";
        ctx.fillText("Prinsessen er reddet!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 45);
        ctx.font = "14px monospace";
        ctx.fillStyle = "#AAA";
        ctx.fillText("Tryk R for at spille igen", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 80);
        ctx.textAlign = "start";
      }

      // Game over screen
      if (state.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "#FFF";
        ctx.font = "bold 48px monospace";
        ctx.textAlign = "center";
        ctx.fillText("Game Over!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
        ctx.font = "24px monospace";
        ctx.fillText(
          `Score: ${state.score}`,
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 + 20
        );
        ctx.font = "18px monospace";
        if (state.checkpoint > 100) {
          ctx.fillText(
            "Tryk R for at starte fra checkpoint",
            CANVAS_WIDTH / 2,
            CANVAS_HEIGHT / 2 + 60
          );
        } else {
          ctx.fillText(
            "Tryk R for at prøve igen",
            CANVAS_WIDTH / 2,
            CANVAS_HEIGHT / 2 + 60
          );
        }
        ctx.textAlign = "start";
      }
    }

    function gameLoop() {
      update();
      draw();
      animId = requestAnimationFrame(gameLoop);
    }

    gameLoop();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      cancelAnimationFrame(animId);
      stopMusic();
    };
  }, [initGame]);

  return (
    <div ref={containerRef} className={`flex flex-col items-center gap-4 ${isFullscreen ? "bg-black" : ""}`}>
      {!isFullscreen && (
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Claude&apos;s Safari Eventyr
        </h1>
      )}
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className={isFullscreen ? "cursor-none" : "rounded-xl border-2 border-gray-700 shadow-2xl"}
        style={isFullscreen ? { display: "block", width: "100vw", height: "100vh", objectFit: "contain", background: "#000" } : undefined}
        tabIndex={0}
      />
      {!isFullscreen && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-gray-400 text-sm flex gap-6">
            <span>J/L: Venstre/Højre</span>
            <span>I / Mellemrum: Hop</span>
            <span>X: Saml våben op</span>
            <span>Z: Slå</span>
          </div>
          <button
            onClick={toggleFullscreen}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-sm font-medium transition-colors"
          >
            Fuld skærm
          </button>
        </div>
      )}
    </div>
  );
}

// --- Helper draw functions ---

function drawCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
) {
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y - size * 0.15, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.7, y, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawSavannaHills(ctx: CanvasRenderingContext2D, cam: number) {
  // Far hills - dusty orange
  ctx.fillStyle = "rgba(180, 140, 80, 0.3)";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let i = 0; i <= CANVAS_WIDTH; i += 60) {
    const worldX = i + cam * 0.1;
    const h = Math.sin(worldX * 0.002) * 40 + Math.sin(worldX * 0.005) * 20 + 80;
    ctx.lineTo(i, GROUND_Y - h);
  }
  ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
  ctx.closePath();
  ctx.fill();

  // Near hills - warmer
  ctx.fillStyle = "rgba(160, 120, 60, 0.25)";
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let i = 0; i <= CANVAS_WIDTH; i += 40) {
    const worldX = i + cam * 0.2;
    const h = Math.sin(worldX * 0.004 + 1) * 30 + Math.sin(worldX * 0.008) * 15 + 50;
    ctx.lineTo(i, GROUND_Y - h);
  }
  ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
  ctx.closePath();
  ctx.fill();

  // Acacia trees in background
  drawAcaciaTrees(ctx, cam);
}

function drawAcaciaTrees(ctx: CanvasRenderingContext2D, cam: number) {
  // Place trees at fixed world positions, parallax at 0.2
  const treePositions = [200, 600, 1100, 1800, 2400, 3100, 3800, 4500, 5300, 6000, 7000, 7800];
  for (const tx of treePositions) {
    const screenX = tx - cam * 0.2;
    const wrappedX = ((screenX % (CANVAS_WIDTH + 300)) + CANVAS_WIDTH + 300) % (CANVAS_WIDTH + 300) - 150;
    drawAcacia(ctx, wrappedX, GROUND_Y - 20);
  }
}

function drawAcacia(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.globalAlpha = 0.4;

  // Trunk
  ctx.fillStyle = "#5C3D2E";
  ctx.fillRect(x - 2, y - 60, 4, 60);

  // Flat canopy (acacia shape)
  ctx.fillStyle = "#6B7D3A";
  ctx.beginPath();
  ctx.ellipse(x, y - 65, 35, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Slightly darker top
  ctx.fillStyle = "#5A6C30";
  ctx.beginPath();
  ctx.ellipse(x + 5, y - 68, 25, 8, 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSafariAnimals(ctx: CanvasRenderingContext2D, cam: number, frame: number) {
  // Elephants and giraffes at fixed positions, moving slowly
  const animals = [
    { type: "elephant", baseX: 400, speed: 0.15 },
    { type: "lion", baseX: 600, speed: 0.08 },
    { type: "giraffe", baseX: 900, speed: 0.1 },
    { type: "zebra", baseX: 1100, speed: 0.13 },
    { type: "rhino", baseX: 1350, speed: 0.07 },
    { type: "elephant", baseX: 1600, speed: 0.12 },
    { type: "leopard", baseX: 1850, speed: 0.16 },
    { type: "buffalo", baseX: 2100, speed: 0.06 },
    { type: "giraffe", baseX: 2300, speed: 0.08 },
    { type: "hippo", baseX: 2550, speed: 0.05 },
    { type: "antelope", baseX: 2800, speed: 0.18 },
    { type: "wildebeest", baseX: 3050, speed: 0.11 },
    { type: "elephant", baseX: 3200, speed: 0.14 },
    { type: "impala", baseX: 3450, speed: 0.19 },
    { type: "cheetah", baseX: 3700, speed: 0.22 },
    { type: "giraffe", baseX: 4000, speed: 0.11 },
    { type: "hyena", baseX: 4250, speed: 0.14 },
    { type: "warthog", baseX: 4500, speed: 0.12 },
    { type: "gorilla", baseX: 4750, speed: 0.04 },
    { type: "elephant", baseX: 5000, speed: 0.13 },
    { type: "swan", baseX: 5250, speed: 0.06 },
    { type: "zebra", baseX: 5500, speed: 0.12 },
    { type: "lion", baseX: 5800, speed: 0.07 },
    { type: "giraffe", baseX: 6000, speed: 0.09 },
    { type: "rhino", baseX: 6300, speed: 0.06 },
    { type: "buffalo", baseX: 6600, speed: 0.08 },
    { type: "leopard", baseX: 6900, speed: 0.15 },
    { type: "wildebeest", baseX: 7200, speed: 0.1 },
    { type: "elephant", baseX: 7500, speed: 0.12 },
    { type: "impala", baseX: 7800, speed: 0.17 },
  ];

  for (const animal of animals) {
    // Animals walk slowly in parallax layer
    const worldX = animal.baseX + frame * animal.speed;
    const screenX = worldX - cam * 0.15;
    const wrappedX = ((screenX % (CANVAS_WIDTH + 200)) + CANVAS_WIDTH + 200) % (CANVAS_WIDTH + 200) - 100;
    const groundY = GROUND_Y - 15;

    ctx.save();
    ctx.globalAlpha = 0.35;

    switch (animal.type) {
      case "elephant": drawElephant(ctx, wrappedX, groundY, frame); break;
      case "giraffe": drawGiraffe(ctx, wrappedX, groundY, frame); break;
      case "lion": drawLion(ctx, wrappedX, groundY, frame); break;
      case "leopard": drawLeopard(ctx, wrappedX, groundY, frame); break;
      case "rhino": drawRhino(ctx, wrappedX, groundY, frame); break;
      case "buffalo": drawBuffalo(ctx, wrappedX, groundY, frame); break;
      case "zebra": drawZebra(ctx, wrappedX, groundY, frame); break;
      case "hippo": drawHippo(ctx, wrappedX, groundY, frame); break;
      case "antelope": drawAntelope(ctx, wrappedX, groundY, frame); break;
      case "wildebeest": drawWildebeest(ctx, wrappedX, groundY, frame); break;
      case "impala": drawImpala(ctx, wrappedX, groundY, frame); break;
      case "swan": drawSwan(ctx, wrappedX, groundY, frame); break;
      case "cheetah": drawCheetah(ctx, wrappedX, groundY, frame); break;
      case "hyena": drawHyena(ctx, wrappedX, groundY, frame); break;
      case "warthog": drawWarthog(ctx, wrappedX, groundY, frame); break;
      case "gorilla": drawGorilla(ctx, wrappedX, groundY, frame); break;
    }

    ctx.restore();
  }
}

function drawElephant(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.04) * 1;

  // Body
  ctx.fillStyle = "#7B7B7B";
  ctx.beginPath();
  ctx.ellipse(x, y - 25 + bob, 28, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.ellipse(x + 22, y - 32 + bob, 12, 10, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Trunk
  ctx.strokeStyle = "#7B7B7B";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 32, y - 28 + bob);
  ctx.quadraticCurveTo(x + 40, y - 20 + bob, x + 36, y - 10 + bob);
  ctx.stroke();

  // Ear
  ctx.fillStyle = "#6B6B6B";
  ctx.beginPath();
  ctx.ellipse(x + 16, y - 34 + bob, 8, 10, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = "#7B7B7B";
  const legBob = Math.sin(frame * 0.04) * 2;
  ctx.fillRect(x - 14, y - 10, 6, 14 + legBob);
  ctx.fillRect(x - 4, y - 10, 6, 14 - legBob);
  ctx.fillRect(x + 8, y - 10, 6, 14 + legBob);
  ctx.fillRect(x + 18, y - 10, 6, 14 - legBob);

  // Tail
  ctx.strokeStyle = "#6B6B6B";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 26, y - 26 + bob);
  ctx.quadraticCurveTo(x - 35, y - 20 + bob, x - 32, y - 15 + bob);
  ctx.stroke();

  // Eye
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 28, y - 34 + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Tusk
  ctx.fillStyle = "#F5F5DC";
  ctx.beginPath();
  ctx.moveTo(x + 28, y - 26 + bob);
  ctx.lineTo(x + 34, y - 18 + bob);
  ctx.lineTo(x + 30, y - 24 + bob);
  ctx.closePath();
  ctx.fill();
}

function drawGiraffe(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.035) * 1;

  // Body
  ctx.fillStyle = "#D4A434";
  ctx.beginPath();
  ctx.ellipse(x, y - 22 + bob, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.fillStyle = "#D4A434";
  ctx.save();
  ctx.translate(x + 12, y - 30 + bob);
  ctx.rotate(-0.15);
  ctx.fillRect(-4, -40, 8, 42);
  ctx.restore();

  // Head
  ctx.beginPath();
  ctx.ellipse(x + 16, y - 72 + bob, 7, 5, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Spots on neck
  ctx.fillStyle = "#8B6914";
  const spots = [
    { dx: 10, dy: -45 },
    { dx: 14, dy: -55 },
    { dx: 11, dy: -38 },
    { dx: 15, dy: -48 },
  ];
  for (const s of spots) {
    ctx.beginPath();
    ctx.ellipse(x + s.dx, y + s.dy + bob, 3, 2.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Spots on body
  ctx.beginPath();
  ctx.ellipse(x - 5, y - 24 + bob, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 5, y - 20 + bob, 3, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ossicones (horns)
  ctx.fillStyle = "#8B6914";
  ctx.fillRect(x + 12, y - 80 + bob, 2, 8);
  ctx.fillRect(x + 18, y - 80 + bob, 2, 8);
  ctx.fillStyle = "#D4A434";
  ctx.beginPath();
  ctx.arc(x + 13, y - 81 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 19, y - 81 + bob, 2, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = "#D4A434";
  const legBob = Math.sin(frame * 0.035) * 2;
  ctx.fillRect(x - 10, y - 12, 4, 16 + legBob);
  ctx.fillRect(x - 2, y - 12, 4, 16 - legBob);
  ctx.fillRect(x + 6, y - 12, 4, 16 + legBob);
  ctx.fillRect(x + 14, y - 12, 4, 16 - legBob);

  // Hooves
  ctx.fillStyle = "#5C3D2E";
  ctx.fillRect(x - 11, y + 3 + legBob, 6, 3);
  ctx.fillRect(x - 3, y + 3 - legBob, 6, 3);
  ctx.fillRect(x + 5, y + 3 + legBob, 6, 3);
  ctx.fillRect(x + 13, y + 3 - legBob, 6, 3);

  // Eye
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 20, y - 73 + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Tail
  ctx.strokeStyle = "#D4A434";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 17, y - 22 + bob);
  ctx.quadraticCurveTo(x - 25, y - 15 + bob, x - 23, y - 10 + bob);
  ctx.stroke();
  // Tail tuft
  ctx.fillStyle = "#8B6914";
  ctx.beginPath();
  ctx.ellipse(x - 23, y - 9 + bob, 3, 2, 0.5, 0, Math.PI * 2);
  ctx.fill();
}

// --- Boss ---
function drawBoss(ctx: CanvasRenderingContext2D, boss: Boss, frame: number) {
  const { x, y, facing, attackTimer, dead, deathTimer, phase } = boss;
  ctx.save();
  ctx.translate(x, y);

  if (dead) {
    const angle = Math.min(deathTimer * 0.03, Math.PI / 2) * facing;
    ctx.rotate(angle);
    ctx.globalAlpha = Math.max(0, 1 - deathTimer * 0.012);
  }

  const size = PLAYER_SIZE * 2.5;
  const bounce = !dead ? Math.sin(frame * 0.15) * 3 : 0;
  ctx.translate(0, bounce);

  // Fire/aura effect in later phases
  if (phase >= 2 && !dead) {
    const auraAlpha = 0.15 + Math.sin(frame * 0.1) * 0.1;
    ctx.fillStyle = phase >= 3 ? `rgba(255,0,0,${auraAlpha})` : `rgba(255,100,0,${auraAlpha})`;
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.1, size * 0.7, size * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shadow on ground
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.42, size * 0.5, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body - massive dark red
  const bodyColor = phase >= 3 ? "#4A0000" : phase >= 2 ? "#6B1111" : "#8B2222";
  const bodyHighlight = phase >= 3 ? "#6B1111" : phase >= 2 ? "#8B2222" : "#A03030";
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  const bw = size * 0.7;
  const bh = size * 0.75;
  const bx = -bw / 2;
  const by = -bh / 2 - size * 0.05;
  const radius = bw * 0.25;
  ctx.moveTo(bx + radius, by);
  ctx.lineTo(bx + bw - radius, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
  ctx.lineTo(bx + bw, by + bh - radius);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
  ctx.lineTo(bx + radius, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
  ctx.lineTo(bx, by + radius);
  ctx.quadraticCurveTo(bx, by, bx + radius, by);
  ctx.closePath();
  ctx.fill();

  // Body highlight/muscle
  ctx.fillStyle = bodyHighlight;
  ctx.beginPath();
  ctx.ellipse(-bw * 0.1, by + bh * 0.3, bw * 0.2, bh * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belt
  ctx.fillStyle = "#3D2B1F";
  ctx.fillRect(bx, by + bh * 0.65, bw, size * 0.06);
  ctx.fillStyle = "#DAA520";
  ctx.beginPath();
  ctx.arc(0, by + bh * 0.68, size * 0.04, 0, Math.PI * 2);
  ctx.fill();

  // Arms - thick muscular
  ctx.fillStyle = bodyColor;
  // Left arm
  ctx.beginPath();
  ctx.ellipse(-bw * 0.55, by + bh * 0.3, size * 0.1, size * 0.2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Right arm
  ctx.beginPath();
  ctx.ellipse(bw * 0.55, by + bh * 0.3, size * 0.1, size * 0.2, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Glowing eyes - BIG
  const eyeY = -size * 0.08;
  const eyeSpread = size * 0.13;

  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.ellipse(-eyeSpread, eyeY, size * 0.07, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeSpread, eyeY, size * 0.07, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Red glowing pupils
  const glowColor = phase >= 3 ? "#FF0000" : "#CC0000";
  ctx.fillStyle = glowColor;
  ctx.shadowColor = "#FF0000";
  ctx.shadowBlur = 10 + phase * 4;
  const ps = facing * size * 0.02;
  ctx.beginPath();
  ctx.arc(-eyeSpread + ps, eyeY, size * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeSpread + ps, eyeY, size * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Thick angry eyebrows
  ctx.fillStyle = "#1A0000";
  ctx.beginPath();
  ctx.moveTo(-eyeSpread - size * 0.08, eyeY - size * 0.1);
  ctx.lineTo(-eyeSpread + size * 0.06, eyeY - size * 0.04);
  ctx.lineTo(-eyeSpread + size * 0.06, eyeY - size * 0.06);
  ctx.lineTo(-eyeSpread - size * 0.08, eyeY - size * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(eyeSpread + size * 0.08, eyeY - size * 0.1);
  ctx.lineTo(eyeSpread - size * 0.06, eyeY - size * 0.04);
  ctx.lineTo(eyeSpread - size * 0.06, eyeY - size * 0.06);
  ctx.lineTo(eyeSpread + size * 0.08, eyeY - size * 0.12);
  ctx.closePath();
  ctx.fill();

  // Battle scar across face
  ctx.strokeStyle = "#FF6666";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-size * 0.18, eyeY - size * 0.06);
  ctx.lineTo(-size * 0.05, eyeY + size * 0.12);
  ctx.stroke();

  // Mean toothy grin
  ctx.fillStyle = "#1A0000";
  ctx.beginPath();
  ctx.arc(0, eyeY + size * 0.14, size * 0.1, 0, Math.PI);
  ctx.fill();
  // Teeth
  ctx.fillStyle = "#DDD";
  for (let t = -3; t <= 3; t++) {
    ctx.fillRect(t * size * 0.025 - size * 0.01, eyeY + size * 0.14, size * 0.02, size * 0.04);
  }

  // GIANT viking helmet
  drawBossHelmet(ctx, size);

  // Legs - thick
  const legY = by + bh;
  const legSpread = !dead ? Math.sin(frame * 0.15) * 5 : 3;
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-bw * 0.3 - legSpread * 0.5, legY, size * 0.14, size * 0.2);
  ctx.fillRect(bw * 0.15 + legSpread * 0.5, legY, size * 0.14, size * 0.2);
  // Boots
  ctx.fillStyle = "#3D2B1F";
  ctx.fillRect(-bw * 0.35 - legSpread * 0.5, legY + size * 0.14, size * 0.2, size * 0.1);
  ctx.fillRect(bw * 0.1 + legSpread * 0.5, legY + size * 0.14, size * 0.2, size * 0.1);

  // Boss weapon - giant axe
  if (!dead) {
    drawBossWeapon(ctx, size, facing, attackTimer);
  }

  ctx.restore();
}

function drawBossHelmet(ctx: CanvasRenderingContext2D, size: number) {
  const helmW = size * 0.5;
  const helmH = size * 0.25;
  const helmY = -size * 0.38;

  // Helmet dome - metallic
  const helmGrad = ctx.createLinearGradient(0, helmY - helmH, 0, helmY);
  helmGrad.addColorStop(0, "#777");
  helmGrad.addColorStop(0.5, "#999");
  helmGrad.addColorStop(1, "#555");
  ctx.fillStyle = helmGrad;
  ctx.beginPath();
  ctx.ellipse(0, helmY, helmW * 0.6, helmH * 1.1, 0, Math.PI, 0);
  ctx.fill();

  // Helmet band with gold studs
  ctx.fillStyle = "#444";
  ctx.fillRect(-helmW * 0.62, helmY - 4, helmW * 1.24, 8);
  ctx.fillStyle = "#DAA520";
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(i * helmW * 0.13, helmY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose guard - thick
  ctx.fillStyle = "#666";
  ctx.fillRect(-4, helmY, 8, size * 0.16);

  // MASSIVE horns
  ctx.fillStyle = "#F5E6C8";
  // Left horn
  ctx.beginPath();
  ctx.moveTo(-helmW * 0.5, helmY - 4);
  ctx.quadraticCurveTo(-helmW * 1.3, helmY - helmH * 3, -helmW * 0.4, helmY - helmH * 4);
  ctx.lineTo(-helmW * 0.2, helmY - helmH * 2.8);
  ctx.quadraticCurveTo(-helmW * 0.8, helmY - helmH * 1.8, -helmW * 0.35, helmY - 4);
  ctx.closePath();
  ctx.fill();
  // Horn rings
  ctx.strokeStyle = "#C4A470";
  ctx.lineWidth = 1.5;
  for (let r = 1; r <= 3; r++) {
    const ry = helmY - helmH * r * 0.9;
    ctx.beginPath();
    ctx.moveTo(-helmW * 0.5 - r * 2, ry);
    ctx.lineTo(-helmW * 0.3 + r * 1, ry - 4);
    ctx.stroke();
  }

  // Right horn
  ctx.fillStyle = "#F5E6C8";
  ctx.beginPath();
  ctx.moveTo(helmW * 0.5, helmY - 4);
  ctx.quadraticCurveTo(helmW * 1.3, helmY - helmH * 3, helmW * 0.4, helmY - helmH * 4);
  ctx.lineTo(helmW * 0.2, helmY - helmH * 2.8);
  ctx.quadraticCurveTo(helmW * 0.8, helmY - helmH * 1.8, helmW * 0.35, helmY - 4);
  ctx.closePath();
  ctx.fill();
  // Horn rings
  for (let r = 1; r <= 3; r++) {
    const ry = helmY - helmH * r * 0.9;
    ctx.beginPath();
    ctx.moveTo(helmW * 0.5 + r * 2, ry);
    ctx.lineTo(helmW * 0.3 - r * 1, ry - 4);
    ctx.stroke();
  }

  // Skull emblem on helmet
  ctx.fillStyle = "#DDD";
  ctx.beginPath();
  ctx.ellipse(0, helmY - helmH * 0.4, size * 0.04, size * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#444";
  ctx.beginPath();
  ctx.arc(-size * 0.015, helmY - helmH * 0.45, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size * 0.015, helmY - helmH * 0.45, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBossWeapon(ctx: CanvasRenderingContext2D, size: number, facing: number, attackTimer: number) {
  ctx.save();
  const handX = facing * size * 0.45;
  ctx.translate(handX, 0);

  if (attackTimer > 0) {
    const progress = 1 - attackTimer / ENEMY_ATTACK_DURATION;
    ctx.rotate(facing * (progress * Math.PI * 1.2 - Math.PI * 0.5));
  } else {
    ctx.rotate(facing * -0.3);
  }

  // Giant axe handle
  ctx.fillStyle = "#5C3D2E";
  ctx.fillRect(-4, -8, 8, 35);
  // Handle grip wrapping
  ctx.strokeStyle = "#8B6914";
  ctx.lineWidth = 2;
  for (let w = 5; w < 30; w += 6) {
    ctx.beginPath();
    ctx.moveTo(-4, -8 + w);
    ctx.lineTo(4, -8 + w + 3);
    ctx.stroke();
  }

  // Giant double-sided axe head
  ctx.fillStyle = "#777";
  // Left blade
  ctx.beginPath();
  ctx.moveTo(-3, -8);
  ctx.quadraticCurveTo(-30, -16, -28, -38);
  ctx.lineTo(-3, -30);
  ctx.closePath();
  ctx.fill();
  // Right blade
  ctx.beginPath();
  ctx.moveTo(3, -8);
  ctx.quadraticCurveTo(30, -16, 28, -38);
  ctx.lineTo(3, -30);
  ctx.closePath();
  ctx.fill();

  // Axe edge shine
  ctx.strokeStyle = "#AAA";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.quadraticCurveTo(-30, -16, -28, -38);
  ctx.stroke();
  ctx.beginPath();
  ctx.quadraticCurveTo(30, -16, 28, -38);
  ctx.stroke();

  // Blood-red edge glow
  ctx.strokeStyle = "rgba(200,0,0,0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-28, -38);
  ctx.lineTo(-30, -16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(28, -38);
  ctx.lineTo(30, -16);
  ctx.stroke();

  ctx.restore();
}

// --- Door and Princess ---
function drawDoorAndPrincess(ctx: CanvasRenderingContext2D, x: number, y: number, doorOpen: boolean, frame: number) {
  ctx.save();
  ctx.translate(x, y);

  // Door frame
  ctx.fillStyle = "#5C3D2E";
  ctx.fillRect(-30, -80, 60, 80);

  if (doorOpen) {
    // Open door - golden light inside
    const glow = 0.6 + Math.sin(frame * 0.05) * 0.2;
    ctx.fillStyle = `rgba(255, 215, 0, ${glow})`;
    ctx.fillRect(-26, -76, 52, 76);

    // Princess Claude inside!
    drawPrincessClaude(ctx, 0, -30, frame);
  } else {
    // Closed door
    ctx.fillStyle = "#8B5E3C";
    ctx.fillRect(-26, -76, 52, 76);
    // Door planks
    ctx.strokeStyle = "#6B4226";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -76);
    ctx.lineTo(0, 0);
    ctx.stroke();
    // Door handle
    ctx.fillStyle = "#DAA520";
    ctx.beginPath();
    ctx.arc(12, -38, 4, 0, Math.PI * 2);
    ctx.fill();
    // Lock
    ctx.fillStyle = "#888";
    ctx.fillRect(8, -34, 8, 6);
    // "LOCKED" text
    ctx.fillStyle = "#CC0000";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("LÅST", 0, -50);
    ctx.textAlign = "start";
  }

  // Door arch
  ctx.strokeStyle = "#4A2A1A";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-32, 0);
  ctx.lineTo(-32, -75);
  ctx.quadraticCurveTo(-32, -85, 0, -88);
  ctx.quadraticCurveTo(32, -85, 32, -75);
  ctx.lineTo(32, 0);
  ctx.stroke();

  ctx.restore();
}

function drawPrincessClaude(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  ctx.save();
  ctx.translate(x, y);

  const size = PLAYER_SIZE * 0.8;
  const bob = Math.sin(frame * 0.04) * 1.5;
  ctx.translate(0, bob);

  // Princess dress - pink/magenta
  ctx.fillStyle = "#E91E8C";
  ctx.beginPath();
  ctx.moveTo(-size * 0.4, size * 0.1);
  ctx.lineTo(-size * 0.55, size * 0.5);
  ctx.lineTo(size * 0.55, size * 0.5);
  ctx.lineTo(size * 0.4, size * 0.1);
  ctx.closePath();
  ctx.fill();

  // Dress details
  ctx.fillStyle = "#FF69B4";
  ctx.beginPath();
  ctx.moveTo(-size * 0.35, size * 0.15);
  ctx.lineTo(-size * 0.45, size * 0.45);
  ctx.lineTo(size * 0.45, size * 0.45);
  ctx.lineTo(size * 0.35, size * 0.15);
  ctx.closePath();
  ctx.fill();

  // Body - Claude's terracotta color
  ctx.fillStyle = "#D97757";
  ctx.beginPath();
  const bw = size * 0.6;
  const bh = size * 0.55;
  const bx = -bw / 2;
  const by = -bh / 2;
  const r = bw * 0.3;
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();

  // Happy eyes with lashes
  const eyeOffsetX = size * 0.1;
  const eyeY = -size * 0.05;
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.ellipse(-eyeOffsetX, eyeY, size * 0.06, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeOffsetX, eyeY, size * 0.06, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pupils with sparkle
  ctx.fillStyle = "#2D1B0E";
  ctx.beginPath();
  ctx.arc(-eyeOffsetX, eyeY, size * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeOffsetX, eyeY, size * 0.04, 0, Math.PI * 2);
  ctx.fill();
  // Eye sparkles
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(-eyeOffsetX - 1, eyeY - 1.5, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeOffsetX - 1, eyeY - 1.5, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Eyelashes
  ctx.strokeStyle = "#2D1B0E";
  ctx.lineWidth = 1;
  [-1, 1].forEach((side) => {
    const ex = side * eyeOffsetX;
    ctx.beginPath();
    ctx.moveTo(ex - 3, eyeY - size * 0.06);
    ctx.lineTo(ex - 5, eyeY - size * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, eyeY - size * 0.07);
    ctx.lineTo(ex, eyeY - size * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex + 3, eyeY - size * 0.06);
    ctx.lineTo(ex + 5, eyeY - size * 0.1);
    ctx.stroke();
  });

  // Blush
  ctx.fillStyle = "rgba(255, 150, 150, 0.4)";
  ctx.beginPath();
  ctx.ellipse(-eyeOffsetX - 2, eyeY + size * 0.06, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeOffsetX + 2, eyeY + size * 0.06, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cute smile
  ctx.strokeStyle = "#2D1B0E";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, eyeY + size * 0.1, size * 0.06, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // Crown / tiara
  ctx.fillStyle = "#FFD700";
  ctx.shadowColor = "#FFD700";
  ctx.shadowBlur = 6;
  const crownY = -size * 0.38;
  // Crown base
  ctx.fillRect(-size * 0.2, crownY, size * 0.4, size * 0.08);
  // Crown points
  ctx.beginPath();
  ctx.moveTo(-size * 0.2, crownY);
  ctx.lineTo(-size * 0.18, crownY - size * 0.15);
  ctx.lineTo(-size * 0.1, crownY - size * 0.05);
  ctx.lineTo(0, crownY - size * 0.18);
  ctx.lineTo(size * 0.1, crownY - size * 0.05);
  ctx.lineTo(size * 0.18, crownY - size * 0.15);
  ctx.lineTo(size * 0.2, crownY);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // Gems on crown
  ctx.fillStyle = "#FF1493";
  ctx.beginPath();
  ctx.arc(0, crownY - size * 0.1, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#00CED1";
  ctx.beginPath();
  ctx.arc(-size * 0.14, crownY - size * 0.08, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size * 0.14, crownY - size * 0.08, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Sparkles around princess
  const sparkleAlpha = 0.4 + Math.sin(frame * 0.08) * 0.3;
  ctx.globalAlpha = sparkleAlpha;
  ctx.fillStyle = "#FFD700";
  drawSparkle(ctx, -size * 0.5, -size * 0.2, 4, frame);
  drawSparkle(ctx, size * 0.5, -size * 0.1, 3, frame + 20);
  drawSparkle(ctx, -size * 0.3, size * 0.3, 3, frame + 40);
  drawSparkle(ctx, size * 0.4, size * 0.35, 4, frame + 60);
  ctx.globalAlpha = 1;

  ctx.restore();
}

// --- All safari background animals ---

function drawLion(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.03) * 1;
  ctx.fillStyle = "#C8963E";
  // Body
  ctx.beginPath();
  ctx.ellipse(x, y - 18 + bob, 22, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  // Mane
  ctx.fillStyle = "#8B5E14";
  ctx.beginPath();
  ctx.ellipse(x + 16, y - 24 + bob, 14, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = "#C8963E";
  ctx.beginPath();
  ctx.ellipse(x + 18, y - 24 + bob, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eye
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 22, y - 26 + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.fillStyle = "#5C3D1E";
  ctx.beginPath();
  ctx.arc(x + 26, y - 23 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  // Legs
  const lb = Math.sin(frame * 0.03) * 2;
  ctx.fillStyle = "#C8963E";
  ctx.fillRect(x - 12, y - 7, 5, 11 + lb);
  ctx.fillRect(x - 3, y - 7, 5, 11 - lb);
  ctx.fillRect(x + 7, y - 7, 5, 11 + lb);
  ctx.fillRect(x + 16, y - 7, 5, 11 - lb);
  // Tail
  ctx.strokeStyle = "#C8963E";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 22, y - 18 + bob);
  ctx.quadraticCurveTo(x - 30, y - 10, x - 28, y - 5 + bob);
  ctx.stroke();
  ctx.fillStyle = "#8B5E14";
  ctx.beginPath();
  ctx.arc(x - 28, y - 4 + bob, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawLeopard(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.05) * 1;
  ctx.fillStyle = "#DAA520";
  // Body - sleek
  ctx.beginPath();
  ctx.ellipse(x, y - 15 + bob, 20, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.ellipse(x + 18, y - 18 + bob, 7, 6, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Spots
  ctx.fillStyle = "#5C3D1E";
  const spotPos = [[-8, -17], [0, -13], [8, -16], [-4, -10], [6, -11]];
  for (const [sx, sy] of spotPos) {
    ctx.beginPath();
    ctx.arc(x + sx, y + sy + bob, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Eye
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 22, y - 19 + bob, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Legs
  ctx.fillStyle = "#DAA520";
  const lb = Math.sin(frame * 0.05) * 2;
  ctx.fillRect(x - 10, y - 6, 4, 10 + lb);
  ctx.fillRect(x - 2, y - 6, 4, 10 - lb);
  ctx.fillRect(x + 6, y - 6, 4, 10 + lb);
  ctx.fillRect(x + 13, y - 6, 4, 10 - lb);
  // Long tail
  ctx.strokeStyle = "#DAA520";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 14 + bob);
  ctx.bezierCurveTo(x - 30, y - 20, x - 35, y - 5, x - 28, y - 2 + bob);
  ctx.stroke();
}

function drawRhino(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.025) * 1;
  ctx.fillStyle = "#808080";
  // Body - big and bulky
  ctx.beginPath();
  ctx.ellipse(x, y - 22 + bob, 26, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.ellipse(x + 22, y - 24 + bob, 12, 9, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Horn
  ctx.fillStyle = "#A0A0A0";
  ctx.beginPath();
  ctx.moveTo(x + 32, y - 28 + bob);
  ctx.lineTo(x + 36, y - 40 + bob);
  ctx.lineTo(x + 34, y - 28 + bob);
  ctx.closePath();
  ctx.fill();
  // Small horn
  ctx.beginPath();
  ctx.moveTo(x + 28, y - 30 + bob);
  ctx.lineTo(x + 30, y - 36 + bob);
  ctx.lineTo(x + 30, y - 30 + bob);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 26, y - 26 + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Legs - thick
  ctx.fillStyle = "#808080";
  const lb = Math.sin(frame * 0.025) * 1.5;
  ctx.fillRect(x - 16, y - 8, 7, 12 + lb);
  ctx.fillRect(x - 4, y - 8, 7, 12 - lb);
  ctx.fillRect(x + 8, y - 8, 7, 12 + lb);
  ctx.fillRect(x + 18, y - 8, 7, 12 - lb);
  // Ear
  ctx.beginPath();
  ctx.ellipse(x + 18, y - 33 + bob, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBuffalo(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.03) * 1;
  ctx.fillStyle = "#3D2B1F";
  // Body
  ctx.beginPath();
  ctx.ellipse(x, y - 22 + bob, 24, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.ellipse(x + 20, y - 22 + bob, 10, 9, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Horns - wide curved
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 14, y - 30 + bob);
  ctx.quadraticCurveTo(x + 8, y - 42 + bob, x + 16, y - 38 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 26, y - 30 + bob);
  ctx.quadraticCurveTo(x + 32, y - 42 + bob, x + 24, y - 38 + bob);
  ctx.stroke();
  // Eye
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 24, y - 24 + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Legs
  ctx.fillStyle = "#3D2B1F";
  const lb = Math.sin(frame * 0.03) * 1.5;
  ctx.fillRect(x - 14, y - 9, 6, 13 + lb);
  ctx.fillRect(x - 3, y - 9, 6, 13 - lb);
  ctx.fillRect(x + 8, y - 9, 6, 13 + lb);
  ctx.fillRect(x + 17, y - 9, 6, 13 - lb);
}

function drawZebra(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.04) * 1;
  // Body - white
  ctx.fillStyle = "#F5F5F5";
  ctx.beginPath();
  ctx.ellipse(x, y - 18 + bob, 18, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Black stripes on body
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  for (let i = -10; i < 14; i += 5) {
    ctx.beginPath();
    ctx.moveTo(x + i, y - 28 + bob);
    ctx.lineTo(x + i - 1, y - 8 + bob);
    ctx.stroke();
  }
  // Head
  ctx.fillStyle = "#F5F5F5";
  ctx.beginPath();
  ctx.ellipse(x + 18, y - 24 + bob, 6, 5, 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Muzzle
  ctx.fillStyle = "#DDD";
  ctx.beginPath();
  ctx.ellipse(x + 23, y - 22 + bob, 4, 3, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Eye
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 20, y - 26 + bob, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Mane
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 10, y - 28 + bob);
  ctx.lineTo(x + 16, y - 30 + bob);
  ctx.stroke();
  // Legs
  ctx.fillStyle = "#F5F5F5";
  const lb = Math.sin(frame * 0.04) * 2;
  ctx.fillRect(x - 10, y - 8, 4, 12 + lb);
  ctx.fillRect(x - 2, y - 8, 4, 12 - lb);
  ctx.fillRect(x + 6, y - 8, 4, 12 + lb);
  ctx.fillRect(x + 13, y - 8, 4, 12 - lb);
  // Hooves
  ctx.fillStyle = "#333";
  ctx.fillRect(x - 11, y + 3 + lb, 6, 2);
  ctx.fillRect(x - 3, y + 3 - lb, 6, 2);
  ctx.fillRect(x + 5, y + 3 + lb, 6, 2);
  ctx.fillRect(x + 12, y + 3 - lb, 6, 2);
}

function drawHippo(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.02) * 1;
  ctx.fillStyle = "#8B7B8B";
  // Body - very round
  ctx.beginPath();
  ctx.ellipse(x, y - 20 + bob, 25, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head - big snout
  ctx.beginPath();
  ctx.ellipse(x + 22, y - 18 + bob, 14, 12, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = "#6B5B6B";
  ctx.beginPath();
  ctx.arc(x + 33, y - 16 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 33, y - 20 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  // Eyes on top
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 26, y - 26 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  // Ears
  ctx.fillStyle = "#8B7B8B";
  ctx.beginPath();
  ctx.ellipse(x + 20, y - 30 + bob, 3, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Short stubby legs
  ctx.fillRect(x - 14, y - 6, 7, 9 + bob);
  ctx.fillRect(x - 2, y - 6, 7, 9);
  ctx.fillRect(x + 8, y - 6, 7, 9 + bob);
  ctx.fillRect(x + 18, y - 6, 7, 9);
}

function drawAntelope(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.05) * 1;
  ctx.fillStyle = "#B8860B";
  // Body - slender
  ctx.beginPath();
  ctx.ellipse(x, y - 18 + bob, 15, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.ellipse(x + 14, y - 24 + bob, 5, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Horns - spiral
  ctx.strokeStyle = "#5C4033";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 12, y - 28 + bob);
  ctx.quadraticCurveTo(x + 8, y - 42 + bob, x + 14, y - 44 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 16, y - 28 + bob);
  ctx.quadraticCurveTo(x + 20, y - 42 + bob, x + 14, y - 44 + bob);
  ctx.stroke();
  // Eye
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 16, y - 25 + bob, 1, 0, Math.PI * 2);
  ctx.fill();
  // White belly
  ctx.fillStyle = "#F5E6C8";
  ctx.beginPath();
  ctx.ellipse(x, y - 14 + bob, 12, 5, 0, 0, Math.PI);
  ctx.fill();
  // Legs - long thin
  ctx.fillStyle = "#B8860B";
  const lb = Math.sin(frame * 0.05) * 3;
  ctx.fillRect(x - 8, y - 10, 3, 14 + lb);
  ctx.fillRect(x - 1, y - 10, 3, 14 - lb);
  ctx.fillRect(x + 5, y - 10, 3, 14 + lb);
  ctx.fillRect(x + 11, y - 10, 3, 14 - lb);
}

function drawWildebeest(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.035) * 1;
  ctx.fillStyle = "#4A4A4A";
  // Body
  ctx.beginPath();
  ctx.ellipse(x, y - 20 + bob, 20, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head - droopy
  ctx.beginPath();
  ctx.ellipse(x + 18, y - 18 + bob, 8, 7, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Beard
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.ellipse(x + 22, y - 12 + bob, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Horns - curved out
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 14, y - 24 + bob);
  ctx.quadraticCurveTo(x + 6, y - 34 + bob, x + 12, y - 36 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 22, y - 24 + bob);
  ctx.quadraticCurveTo(x + 30, y - 34 + bob, x + 24, y - 36 + bob);
  ctx.stroke();
  // Mane stripe
  ctx.fillStyle = "#333";
  ctx.fillRect(x + 4, y - 32 + bob, 12, 3);
  // Eye
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 22, y - 20 + bob, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Legs
  ctx.fillStyle = "#4A4A4A";
  const lb = Math.sin(frame * 0.035) * 2;
  ctx.fillRect(x - 12, y - 8, 5, 12 + lb);
  ctx.fillRect(x - 3, y - 8, 5, 12 - lb);
  ctx.fillRect(x + 6, y - 8, 5, 12 + lb);
  ctx.fillRect(x + 14, y - 8, 5, 12 - lb);
}

function drawImpala(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.06) * 1;
  ctx.fillStyle = "#CD853F";
  // Body - graceful
  ctx.beginPath();
  ctx.ellipse(x, y - 16 + bob, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.ellipse(x + 13, y - 22 + bob, 5, 4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Lyre-shaped horns
  ctx.strokeStyle = "#5C4033";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 11, y - 26 + bob);
  ctx.bezierCurveTo(x + 4, y - 38, x + 10, y - 44, x + 14, y - 40 + bob);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 15, y - 26 + bob);
  ctx.bezierCurveTo(x + 22, y - 38, x + 16, y - 44, x + 12, y - 40 + bob);
  ctx.stroke();
  // Eye
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 15, y - 23 + bob, 1, 0, Math.PI * 2);
  ctx.fill();
  // White belly
  ctx.fillStyle = "#F5DEB3";
  ctx.beginPath();
  ctx.ellipse(x, y - 12 + bob, 11, 4, 0, 0, Math.PI);
  ctx.fill();
  // Legs - very slender
  ctx.fillStyle = "#CD853F";
  const lb = Math.sin(frame * 0.06) * 3;
  ctx.fillRect(x - 7, y - 9, 3, 13 + lb);
  ctx.fillRect(x - 1, y - 9, 3, 13 - lb);
  ctx.fillRect(x + 4, y - 9, 3, 13 + lb);
  ctx.fillRect(x + 10, y - 9, 3, 13 - lb);
}

function drawSwan(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.03) * 1;
  ctx.fillStyle = "#FAFAFA";
  // Body
  ctx.beginPath();
  ctx.ellipse(x, y - 10 + bob, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Elegant neck - S-curve
  ctx.strokeStyle = "#FAFAFA";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 10, y - 14 + bob);
  ctx.bezierCurveTo(x + 16, y - 28, x + 8, y - 40, x + 14, y - 44 + bob);
  ctx.stroke();
  // Head
  ctx.fillStyle = "#FAFAFA";
  ctx.beginPath();
  ctx.ellipse(x + 14, y - 44 + bob, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Beak
  ctx.fillStyle = "#FF8C00";
  ctx.beginPath();
  ctx.moveTo(x + 18, y - 45 + bob);
  ctx.lineTo(x + 22, y - 43 + bob);
  ctx.lineTo(x + 18, y - 42 + bob);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 15, y - 45 + bob, 1, 0, Math.PI * 2);
  ctx.fill();
  // Wing
  ctx.fillStyle = "#EEE";
  ctx.beginPath();
  ctx.ellipse(x - 2, y - 14 + bob, 12, 7, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // Feet
  ctx.fillStyle = "#333";
  ctx.fillRect(x - 4, y - 3, 3, 5);
  ctx.fillRect(x + 3, y - 3, 3, 5);
}

function drawCheetah(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.06) * 1;
  ctx.fillStyle = "#E8C84A";
  // Body - sleek and long
  ctx.beginPath();
  ctx.ellipse(x, y - 16 + bob, 20, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head - small
  ctx.beginPath();
  ctx.ellipse(x + 20, y - 20 + bob, 6, 5, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Black spots
  ctx.fillStyle = "#333";
  const spots = [[-10, -18], [-2, -14], [4, -18], [10, -14], [-6, -12], [8, -10]];
  for (const [sx, sy] of spots) {
    ctx.beginPath();
    ctx.arc(x + sx, y + sy + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tear marks (face)
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 22, y - 20 + bob);
  ctx.lineTo(x + 24, y - 15 + bob);
  ctx.stroke();
  // Eye
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 23, y - 21 + bob, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Legs - long
  ctx.fillStyle = "#E8C84A";
  const lb = Math.sin(frame * 0.06) * 3;
  ctx.fillRect(x - 12, y - 8, 3, 12 + lb);
  ctx.fillRect(x - 4, y - 8, 3, 12 - lb);
  ctx.fillRect(x + 6, y - 8, 3, 12 + lb);
  ctx.fillRect(x + 14, y - 8, 3, 12 - lb);
  // Long tail
  ctx.strokeStyle = "#E8C84A";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 20, y - 14 + bob);
  ctx.bezierCurveTo(x - 30, y - 22, x - 38, y - 10, x - 34, y - 5 + bob);
  ctx.stroke();
}

function drawHyena(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.04) * 1;
  ctx.fillStyle = "#A0825A";
  // Body - sloping back
  ctx.beginPath();
  ctx.moveTo(x - 14, y - 10 + bob);
  ctx.quadraticCurveTo(x - 8, y - 28 + bob, x + 8, y - 22 + bob);
  ctx.quadraticCurveTo(x + 18, y - 18 + bob, x + 18, y - 8 + bob);
  ctx.lineTo(x - 14, y - 8 + bob);
  ctx.closePath();
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.ellipse(x + 16, y - 16 + bob, 7, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Muzzle
  ctx.fillStyle = "#8B7355";
  ctx.beginPath();
  ctx.ellipse(x + 22, y - 14 + bob, 4, 3, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Ears - large round
  ctx.fillStyle = "#A0825A";
  ctx.beginPath();
  ctx.ellipse(x + 12, y - 22 + bob, 4, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + 18, y - 22 + bob, 4, 5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Spots
  ctx.fillStyle = "#6B5B3A";
  ctx.beginPath();
  ctx.arc(x - 4, y - 18 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 4, y - 22 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  // Eye
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 18, y - 17 + bob, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Legs - front taller
  ctx.fillStyle = "#A0825A";
  const lb = Math.sin(frame * 0.04) * 2;
  ctx.fillRect(x - 10, y - 8, 4, 12 + lb);
  ctx.fillRect(x - 3, y - 8, 4, 12 - lb);
  ctx.fillRect(x + 6, y - 6, 4, 10 + lb);
  ctx.fillRect(x + 13, y - 6, 4, 10 - lb);
}

function drawWarthog(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.04) * 1;
  ctx.fillStyle = "#7B6B5B";
  // Body - stocky
  ctx.beginPath();
  ctx.ellipse(x, y - 14 + bob, 16, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head - big flat
  ctx.beginPath();
  ctx.ellipse(x + 16, y - 14 + bob, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Snout bumps (warts)
  ctx.fillStyle = "#6B5B4B";
  ctx.beginPath();
  ctx.arc(x + 20, y - 18 + bob, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 18, y - 10 + bob, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Tusks
  ctx.fillStyle = "#F5F5DC";
  ctx.beginPath();
  ctx.moveTo(x + 24, y - 12 + bob);
  ctx.quadraticCurveTo(x + 30, y - 8 + bob, x + 28, y - 16 + bob);
  ctx.lineTo(x + 26, y - 12 + bob);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x + 20, y - 16 + bob, 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Mane
  ctx.fillStyle = "#555";
  ctx.fillRect(x - 2, y - 24 + bob, 14, 3);
  // Tail - up!
  ctx.strokeStyle = "#7B6B5B";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 16, y - 14 + bob);
  ctx.quadraticCurveTo(x - 22, y - 30 + bob, x - 18, y - 34 + bob);
  ctx.stroke();
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.arc(x - 18, y - 35 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  // Short legs
  ctx.fillStyle = "#7B6B5B";
  const lb = Math.sin(frame * 0.04) * 2;
  ctx.fillRect(x - 10, y - 5, 4, 9 + lb);
  ctx.fillRect(x - 3, y - 5, 4, 9 - lb);
  ctx.fillRect(x + 5, y - 5, 4, 9 + lb);
  ctx.fillRect(x + 12, y - 5, 4, 9 - lb);
}

function drawGorilla(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bob = Math.sin(frame * 0.02) * 1;
  ctx.fillStyle = "#2F2F2F";
  // Body - massive
  ctx.beginPath();
  ctx.ellipse(x, y - 22 + bob, 20, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.ellipse(x + 2, y - 38 + bob, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Silver back
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.ellipse(x - 4, y - 24 + bob, 12, 8, 0, 0, Math.PI);
  ctx.fill();
  // Face
  ctx.fillStyle = "#4A3A2A";
  ctx.beginPath();
  ctx.ellipse(x + 2, y - 36 + bob, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x - 1, y - 38 + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 5, y - 38 + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.ellipse(x + 2, y - 34 + bob, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Arms - long, knuckle-walking
  ctx.fillStyle = "#2F2F2F";
  ctx.beginPath();
  ctx.moveTo(x - 16, y - 28 + bob);
  ctx.quadraticCurveTo(x - 24, y - 16, x - 20, y - 6 + bob);
  ctx.lineTo(x - 16, y - 6 + bob);
  ctx.quadraticCurveTo(x - 18, y - 20, x - 12, y - 26 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 16, y - 28 + bob);
  ctx.quadraticCurveTo(x + 24, y - 16, x + 20, y - 6 + bob);
  ctx.lineTo(x + 16, y - 6 + bob);
  ctx.quadraticCurveTo(x + 18, y - 20, x + 12, y - 26 + bob);
  ctx.closePath();
  ctx.fill();
  // Legs - short
  ctx.fillRect(x - 8, y - 8, 6, 10 + bob);
  ctx.fillRect(x + 4, y - 8, 6, 10);
}

function drawSpike(ctx: CanvasRenderingContext2D, obs: Obstacle) {
  const { x, y, width, height } = obs;
  ctx.fillStyle = obs.color;
  const spikes = Math.max(1, Math.floor(width / 12));
  const spikeW = width / spikes;
  for (let i = 0; i < spikes; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * spikeW, y + height);
    ctx.lineTo(x + i * spikeW + spikeW / 2, y);
    ctx.lineTo(x + (i + 1) * spikeW, y + height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#922B21";
  ctx.fillRect(x, y + height - 5, width, 5);
}

function drawCoin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number
) {
  const scale = Math.abs(Math.cos(frame * 0.05));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, 1);
  ctx.fillStyle = "#FFD700";
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFA500";
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFEB3B";
  ctx.globalAlpha = 0.6 + Math.sin(frame * 0.1) * 0.4;
  ctx.beginPath();
  ctx.arc(-2, -2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
