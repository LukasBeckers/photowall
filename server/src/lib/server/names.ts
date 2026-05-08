// Tiny adjective + noun generator for guests who skip the display-name field
// on /login. 20 × 20 = 400 combinations — collisions across ~80 party guests
// are rare and harmless because sessions are uuid-keyed, only the rendered
// label collides.

const ADJECTIVES = [
  'Happy', 'Sleepy', 'Sneaky', 'Dancing', 'Bright', 'Cosmic',
  'Jolly', 'Lucky', 'Quiet', 'Swift', 'Sparkling', 'Friendly',
  'Mellow', 'Curious', 'Brave', 'Witty', 'Tiny', 'Mighty',
  'Funky', 'Velvet'
];

const NOUNS = [
  'Panda', 'Fox', 'Otter', 'Llama', 'Koala', 'Narwhal',
  'Axolotl', 'Gecko', 'Pelican', 'Flamingo', 'Hedgehog', 'Penguin',
  'Raccoon', 'Capybara', 'Sloth', 'Manatee', 'Octopus', 'Lemur',
  'Walrus', 'Owl'
];

export function randomDisplayName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a} ${n}`;
}
