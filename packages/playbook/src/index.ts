export type PlaybookLevel =
  | "beginner"
  | "adventurous"
  | "daring"
  | "bold"
  | "risque"
  | "exhibitionist"
  | "daredevil"
  | "thrill_seeker"
  | "legendary"
  | "extreme"
  | "mythical"
  | "ultimate"
  | "legendary_challenges";

export const LEVEL_ORDER: Record<PlaybookLevel, number> = {
  beginner: 1,
  adventurous: 2,
  daring: 3,
  bold: 4,
  risque: 5,
  exhibitionist: 6,
  daredevil: 7,
  thrill_seeker: 8,
  legendary: 9,
  extreme: 10,
  mythical: 11,
  ultimate: 12,
  legendary_challenges: 13,
};

export const LEVEL_LABELS: Record<PlaybookLevel, string> = {
  beginner: "Beginner",
  adventurous: "Adventurous",
  daring: "Daring",
  bold: "Bold",
  risque: "Risqué",
  exhibitionist: "Exhibitionist",
  daredevil: "Daredevil",
  thrill_seeker: "Thrill-Seeker",
  legendary: "Legendary",
  extreme: "Extreme",
  mythical: "Mythical",
  ultimate: "Ultimate",
  legendary_challenges: "Legendary Challenges",
};

export type PlaybookDare = {
  /** URL-safe unique identifier */
  slug: string;
  emoji: string;
  name: string;
  description: string;
  level: PlaybookLevel;
  /** 1 = easiest (beginner), 13 = hardest (legendary challenges) */
  levelOrder: number;
  /** position within the level, 1-indexed */
  dareOrder: number;
};

export const PLAYBOOK_DARES: PlaybookDare[] = [
  // ── BEGINNER ──────────────────────────────────────────────────────────────
  { slug: "hands-bra", emoji: "👐", name: "Hands Bra", description: "Use your hands (or someone else's) as a makeshift bra in a photo.", level: "beginner", levelOrder: 1, dareOrder: 1 },
  { slug: "one-finger-challenge", emoji: "👆", name: "One Finger Challenge", description: "Take a naked picture where you hide both your breast and sex with just one finger. Search on Reddit for examples!", level: "beginner", levelOrder: 1, dareOrder: 2 },
  { slug: "heartboob", emoji: "❤️", name: "Heartboob", description: "Make a heart shape with your fingers around one of your breasts.", level: "beginner", levelOrder: 1, dareOrder: 3 },
  { slug: "on-off", emoji: "🔄", name: "On/Off", description: "Take two photos in the exact same position: one fully clothed and one completely naked. Think r/OnOff style.", level: "beginner", levelOrder: 1, dareOrder: 4 },
  { slug: "the-arsenal", emoji: "🧰", name: "The Arsenal", description: "Show off your sex toy collection in all its glory.", level: "beginner", levelOrder: 1, dareOrder: 5 },
  { slug: "good-girl-gone-bad", emoji: "😇", name: "Good Girl Gone Bad", description: "Take a submissive photo with panties stuffed in your mouth.", level: "beginner", levelOrder: 1, dareOrder: 6 },
  { slug: "the-music-video", emoji: "🎵", name: "The Music Video", description: "Create a short lip-sync to a suggestive song with choreography that gets increasingly daring.", level: "beginner", levelOrder: 1, dareOrder: 7 },

  // ── ADVENTUROUS ───────────────────────────────────────────────────────────
  { slug: "the-thunder-tease", emoji: "🌧️", name: "The Thunder Tease", description: "During a thunderstorm, stand near a window as lightning illuminates your silhouette in brief flashes.", level: "adventurous", levelOrder: 2, dareOrder: 1 },
  { slug: "human-canvas", emoji: "✍️", name: "Human Canvas", description: "Write dirty, slutty, or degrading words all over your naked body.", level: "adventurous", levelOrder: 2, dareOrder: 2 },
  { slug: "the-confessional", emoji: "📖", name: "The Confessional", description: "Share a true slutty story that happened to you. Bonus points for including pictures.", level: "adventurous", levelOrder: 2, dareOrder: 3 },
  { slug: "wilson", emoji: "🏐", name: "Wilson!", description: "Leave two clear handprints on your ass cheeks, like Wilson the volleyball from Cast Away!", level: "adventurous", levelOrder: 2, dareOrder: 4 },
  { slug: "ice-queen", emoji: "❄️", name: "Ice Queen", description: "Have some sensual fun with ice cubes. Show how they make your nipples hard and get everything wet. Bonus for outdoor ice play!", level: "adventurous", levelOrder: 2, dareOrder: 5 },
  { slug: "the-classic-flash", emoji: "👗", name: "The Classic Flash", description: "In a store changing room between two outfits.", level: "adventurous", levelOrder: 2, dareOrder: 6 },
  { slug: "the-peek-a-boo", emoji: "🔍", name: "The Peek-a-Boo", description: "Create photos through various frames - keyholes, partially open doors, blinds, shower glass.", level: "adventurous", levelOrder: 2, dareOrder: 7 },
  { slug: "the-pornstar-pose", emoji: "🍑", name: "The Pornstar Pose", description: '"Face down, ass up" position photo. Just like the song says, "that\'s the way we like to fuck!"', level: "adventurous", levelOrder: 2, dareOrder: 8 },

  // ── DARING ────────────────────────────────────────────────────────────────
  { slug: "window-slut", emoji: "🪟", name: "Window Slut", description: "Pose completely naked by a window where someone might see.", level: "daring", levelOrder: 3, dareOrder: 1 },
  { slug: "the-online-tease", emoji: "🎭", name: "The Online Tease", description: "Try various scenarios on Omegle: ask for outfit advice while subtly flashing, chat in a towel or lingerie, or 'accidentally' appear with tits out.", level: "daring", levelOrder: 3, dareOrder: 2 },
  { slug: "morning-brew-and-boobs", emoji: "☕", name: "Morning Brew & Boobs", description: "Enjoy your coffee or tea while naked or tits out.", level: "daring", levelOrder: 3, dareOrder: 3 },
  { slug: "the-quivering-countdown", emoji: "🔋", name: "The Quivering Countdown", description: "Record yourself counting from 100 to 0 while a vibrator buzzes at maximum speed on your clit.", level: "daring", levelOrder: 3, dareOrder: 4 },
  { slug: "gym-slut", emoji: "💪", name: "Gym Slut", description: "Share a photo of yourself exercising in something extremely revealing.", level: "daring", levelOrder: 3, dareOrder: 5 },
  { slug: "position-master", emoji: "🤸‍♀️", name: "Position Master", description: "Take photos in various sexy positions. Could be yoga poses, masturbation positions, or fucking positions.", level: "daring", levelOrder: 3, dareOrder: 6 },
  { slug: "naked-chief", emoji: "👩‍🍳", name: "Naked Chief", description: "Cook something while completely naked or wearing just an apron.", level: "daring", levelOrder: 3, dareOrder: 7 },

  // ── BOLD ──────────────────────────────────────────────────────────────────
  { slug: "winnie-the-pooh", emoji: "🐻", name: "Winnie the Pooh", description: "Only a shirt just long enough to cover your bits and go for a walk.", level: "bold", levelOrder: 4, dareOrder: 1 },
  { slug: "the-mall-commando", emoji: "👗", name: "The Mall Commando", description: "Go shopping in a mall wearing a skirt with no panties underneath.", level: "bold", levelOrder: 4, dareOrder: 2 },
  { slug: "the-self-admirer", emoji: "📱", name: "The Self-Admirer", description: "Use a nude photo of yourself as your phone wallpaper for a full week.", level: "bold", levelOrder: 4, dareOrder: 3 },
  { slug: "the-strip-queen", emoji: "💃", name: "The Strip Queen", description: "Film yourself doing a complete striptease dance. Start fully clothed and end with everything off.", level: "bold", levelOrder: 4, dareOrder: 4 },
  { slug: "the-slippery-slut", emoji: "💦", name: "The Slippery Slut", description: "Cover your naked body in oil or moisturizer for a shiny, slippery photoshoot that shows off every curve.", level: "bold", levelOrder: 4, dareOrder: 5 },
  { slug: "the-bikini-challenge", emoji: "👙", name: "The Bikini Challenge", description: "Put on a bikini, untie the top from your neck and hold the strings in your mouth, then start a powerful vibrator and see how long you can hold the top before you moan and drop it. Record a video!", level: "bold", levelOrder: 4, dareOrder: 6 },
  { slug: "the-hysterical-literature", emoji: "📚", name: "The Hysterical Literature", description: 'Read a book aloud while using a vibrator on your clit. Try to keep your voice steady as you get closer to cumming.', level: "bold", levelOrder: 4, dareOrder: 7 },
  { slug: "the-london-bridge", emoji: "🌉", name: "The London Bridge", description: "Hold a gymnastics bridge position while using a vibrator at full speed on your pussy. See how long you can maintain the position before collapsing in pleasure.", level: "bold", levelOrder: 4, dareOrder: 8 },

  // ── RISQUÉ ────────────────────────────────────────────────────────────────
  { slug: "the-librarian", emoji: "📚", name: "The Librarian", description: "Browse books in a bookstore while wearing reading glasses and a buttoned shirt with strategic buttons undone.", level: "risque", levelOrder: 5, dareOrder: 1 },
  { slug: "the-garden-of-eden", emoji: "🍎", name: "The Garden of Eden", description: "Create a photoshoot inspired by Eve in the garden. Use strategically placed fruits and leaves for coverage.", level: "risque", levelOrder: 5, dareOrder: 2 },
  { slug: "the-melting-moment", emoji: "🍦", name: "The Melting Moment", description: "Document what happens when ice cream or popsicle melts across your body on a hot day.", level: "risque", levelOrder: 5, dareOrder: 3 },
  { slug: "the-wax-challenger", emoji: "🕯️", name: "The Wax Challenger", description: "Place a lit candle on your belly and use a vibrator on your clit. Don't let the candle fall as you get close to cumming!", level: "risque", levelOrder: 5, dareOrder: 4 },
  { slug: "the-nip-slip", emoji: "👚", name: "The Nip Slip", description: "Walk or ride in public with a strategic wardrobe malfunction exposing a nipple or more.", level: "risque", levelOrder: 5, dareOrder: 5 },
  { slug: "the-office-flasher", emoji: "💼", name: "The Office Flasher", description: "Quick tit or pussy flash at work when nobody's looking (be careful with this one!).", level: "risque", levelOrder: 5, dareOrder: 6 },
  { slug: "yoga-outfit", emoji: "🧘‍♀️", name: "Yoga Outfit", description: "Wear tight yoga pants with a visible thong underneath, and a sports shirt with no bra showing your hard nipples. Take some photos around town or in a store.", level: "risque", levelOrder: 5, dareOrder: 7 },
  { slug: "the-pinup-girl", emoji: "📷", name: "The Pinup Girl", description: 'Take artistic, sensual boudoir photos in a bedroom setting - "Draw me like one of your French girls."', level: "risque", levelOrder: 5, dareOrder: 8 },
  { slug: "the-door-dare", emoji: "🚪", name: "The Door Dare", description: 'Take a completely nude photo at your front door (from inside, of course).', level: "risque", levelOrder: 5, dareOrder: 9 },

  // ── EXHIBITIONIST ─────────────────────────────────────────────────────────
  { slug: "the-unexpected-text", emoji: "📱", name: "The Unexpected Text", description: "Send a sexy picture to a contact and post the conversation (with consent and privacy respected).", level: "exhibitionist", levelOrder: 6, dareOrder: 1 },
  { slug: "the-see-through-slut", emoji: "👕", name: "The See-Through Slut", description: "Wear a completely sheer shirt where your nipples are clearly visible through the fabric.", level: "exhibitionist", levelOrder: 6, dareOrder: 2 },
  { slug: "the-bathroom-exhibitionist", emoji: "🚻", name: "The Bathroom Exhibitionist", description: "Flash your tits or pussy in the public area of a bathroom, door unlocked, where someone could walk in any second.", level: "exhibitionist", levelOrder: 6, dareOrder: 3 },
  { slug: "the-living-platter", emoji: "🍣", name: "The Living Platter", description: "Let someone eat food off your naked body. Works perfectly with sushi or Tequila shots.", level: "exhibitionist", levelOrder: 6, dareOrder: 4 },
  { slug: "the-wild-flasher", emoji: "🌲", name: "The Wild Flasher", description: "Take nude photos outdoors in nature (seasonal bonus for snow pictures!).", level: "exhibitionist", levelOrder: 6, dareOrder: 5 },
  { slug: "the-anything-but-clothes", emoji: "🎭", name: "The Anything But Clothes", description: "Wear anything except actual clothing. Plastic wrap, food items, body paint - get creative with your coverage!", level: "exhibitionist", levelOrder: 6, dareOrder: 6 },
  { slug: "the-commando-queen", emoji: "👗", name: "The Commando Queen", description: "Go out wearing a short summer dress with absolutely nothing underneath - no panties, no bra.", level: "exhibitionist", levelOrder: 6, dareOrder: 7 },
  { slug: "the-topless-mixologist", emoji: "🍸", name: "The Topless Mixologist", description: "Shake a cocktail while completely topless, letting your tits bounce freely.", level: "exhibitionist", levelOrder: 6, dareOrder: 8 },

  // ── DAREDEVIL ─────────────────────────────────────────────────────────────
  { slug: "the-store-exhibitionist", emoji: "🏪", name: "The Store Exhibitionist", description: "Quick tit or pussy flash inside a shop (be extremely careful and respectful of others).", level: "daredevil", levelOrder: 7, dareOrder: 1 },
  { slug: "the-sun-worshipper", emoji: "☀️", name: "The Sun Worshipper", description: 'Document your tanning process with before, during, and after nude photos. Optional: create a "tan tattoo" by strategically covering parts of your body.', level: "daredevil", levelOrder: 7, dareOrder: 2 },
  { slug: "the-rope-bunny", emoji: "🔗", name: "The Rope Bunny", description: "Take photos in various bondage situations (safety first!).", level: "daredevil", levelOrder: 7, dareOrder: 3 },
  { slug: "the-dice-slut", emoji: "🎲", name: "The Dice Slut", description: "Roll a die each morning. The number you roll is the maximum clothing items you can wear that day (excluding footwear).", level: "daredevil", levelOrder: 7, dareOrder: 4 },
  { slug: "the-road-flasher", emoji: "🚗", name: "The Road Flasher", description: "Quick tit or pussy flash from inside your car where other drivers might see.", level: "daredevil", levelOrder: 7, dareOrder: 5 },
  { slug: "the-cum-target", emoji: "💦", name: "The Cum Target", description: "Ask for a cum tribute on r/TributeMe.", level: "daredevil", levelOrder: 7, dareOrder: 6 },
  { slug: "the-public-cocksucker", emoji: "📱", name: "The Public Cocksucker", description: "Show a picture of yourself giving a blowjob on your phone screen in a public place.", level: "daredevil", levelOrder: 7, dareOrder: 7 },

  // ── THRILL-SEEKER ─────────────────────────────────────────────────────────
  { slug: "the-webcam-hunt", emoji: "💻", name: "The Webcam Hunt", description: "Choose an interest on Omegle, post it on this subreddit, and wait for a redditor to find you.", level: "thrill_seeker", levelOrder: 8, dareOrder: 1 },
  { slug: "the-strip-gamer", emoji: "🎮", name: "The Strip Gamer", description: "Play strip Tetris against someone on Bazoocam. Lose deliberately?", level: "thrill_seeker", levelOrder: 8, dareOrder: 2 },
  { slug: "the-bar-flasher", emoji: "🍸", name: "The Bar Flasher", description: "Quick tit or pussy flash in a restaurant or bar (be extremely discreet).", level: "thrill_seeker", levelOrder: 8, dareOrder: 3 },
  { slug: "the-truckers-delight", emoji: "🚚", name: "The Trucker's Delight", description: "Flash your tits to a truck driver from your car or sidewalk.", level: "thrill_seeker", levelOrder: 8, dareOrder: 4 },
  { slug: "the-wet-t-shirt-pro", emoji: "💧", name: "The Wet T-Shirt Pro", description: "Wear a swimsuit or white top that becomes completely see-through when wet, then get soaked in public.", level: "thrill_seeker", levelOrder: 8, dareOrder: 5 },
  { slug: "the-split-screen", emoji: "📱", name: "The Split Screen", description: "Half the screen shows you in public, seemingly normal. The other half reveals what's happening beneath the table or behind the scenes.", level: "thrill_seeker", levelOrder: 8, dareOrder: 6 },
  { slug: "the-thrill-ride", emoji: "🎢", name: "The Thrill Ride", description: "Flash your tits on a roller coaster, bonus if it's caught on the ride camera!", level: "thrill_seeker", levelOrder: 8, dareOrder: 7 },

  // ── LEGENDARY ─────────────────────────────────────────────────────────────
  { slug: "the-wine-tasting", emoji: "🍷", name: "The Wine Tasting", description: "Create a photoshoot enjoying wine where each sip means removing one article of clothing.", level: "legendary", levelOrder: 9, dareOrder: 1 },
  { slug: "the-marilyn-moment", emoji: "💨", name: "The Marilyn Moment", description: "Channel Marilyn Monroe with a short dress and sexy panties on a windy day, letting your dress blow up.", level: "legendary", levelOrder: 9, dareOrder: 2 },
  { slug: "the-water-nymph", emoji: "💧", name: "The Water Nymph", description: "Photograph yourself emerging from water with fabric clinging to your form.", level: "legendary", levelOrder: 9, dareOrder: 3 },
  { slug: "the-home-exhibition", emoji: "🖼️", name: "The Home Exhibition", description: "Frame a tasteful nude photo of yourself and hang it in your home where guests might see it.", level: "legendary", levelOrder: 9, dareOrder: 4 },
  { slug: "the-shop-flasher", emoji: "👗", name: "The Shop Flasher", description: 'Walk out of a changing room partially dressed to "ask for another size."', level: "legendary", levelOrder: 9, dareOrder: 5 },
  { slug: "the-freezer-tease", emoji: "❄️", name: "The Freezer Tease", description: "Put your phone in a store freezer and film yourself pressing your tits against the glass.", level: "legendary", levelOrder: 9, dareOrder: 6 },
  { slug: "the-drive-thru-flasher", emoji: "🍔", name: "The Drive-Thru Flasher", description: "Visit a fast-food drive-thru while completely topless.", level: "legendary", levelOrder: 9, dareOrder: 7 },
  { slug: "the-bathroom-masturbator", emoji: "🚽", name: "The Bathroom Masturbator", description: "Use a suction dildo in a public bathroom with people nearby, trying not to moan too loud.", level: "legendary", levelOrder: 9, dareOrder: 8 },
  { slug: "the-topless-light", emoji: "🚬", name: "The Topless Light", description: "Ask a stranger to light your cigarette while your tits are completely exposed.", level: "legendary", levelOrder: 9, dareOrder: 9 },
  { slug: "the-secret-masturbator", emoji: "📞", name: "The Secret Masturbator", description: "Have a casual phone conversation while masturbating or being fucked.", level: "legendary", levelOrder: 9, dareOrder: 10 },
  { slug: "the-tourist", emoji: "🗼", name: "The Tourist", description: "Get your picture taken by a stranger in front of a tourist spot. Flash or have an accidental slip.", level: "legendary", levelOrder: 9, dareOrder: 11 },

  // ── EXTREME ───────────────────────────────────────────────────────────────
  { slug: "the-unraveling", emoji: "🧵", name: "The Unraveling", description: "Start wrapped in a long piece of ribbon, string, or fabric that gradually unwinds throughout a video.", level: "extreme", levelOrder: 10, dareOrder: 1 },
  { slug: "the-full-naturist", emoji: "🌳", name: "The Full Naturist", description: "Get completely naked outside where people might pass by.", level: "extreme", levelOrder: 10, dareOrder: 2 },
  { slug: "the-remote-slut", emoji: "📳", name: "The Remote Slut", description: "Wear a remote-controlled vibrator in public, giving the control to someone else.", level: "extreme", levelOrder: 10, dareOrder: 3 },
  { slug: "the-visible-plug", emoji: "🍑", name: "The Visible Plug", description: "Go for a walk wearing tight yoga pants with a visible butt plug underneath.", level: "extreme", levelOrder: 10, dareOrder: 4 },
  { slug: "the-bathroom-artist", emoji: "📸", name: "The Bathroom Artist", description: "Take a nude Polaroid in a bar bathroom and leave it on the wall. Bonus if you include your username.", level: "extreme", levelOrder: 10, dareOrder: 5 },
  { slug: "the-see-through-day", emoji: "👚", name: "The See-Through Day", description: "Wear something partially see-through for an entire day where your nipples or pussy outline are visible.", level: "extreme", levelOrder: 10, dareOrder: 6 },
  { slug: "the-sky-high-flasher", emoji: "✈️", name: "The Sky High Flasher", description: "Quick tit or pussy flash from your airplane seat.", level: "extreme", levelOrder: 10, dareOrder: 7 },
  { slug: "the-frozen-exhibitionist", emoji: "☃️", name: "The Frozen Exhibitionist", description: "Make a naked snow angel.", level: "extreme", levelOrder: 10, dareOrder: 8 },

  // ── MYTHICAL ──────────────────────────────────────────────────────────────
  { slug: "the-mail-run", emoji: "📬", name: "The Mail Run", description: "Get your mail wearing as little as you dare - maybe just heels?", level: "mythical", levelOrder: 11, dareOrder: 1 },
  { slug: "the-car-wash-strip", emoji: "🚿", name: "The Car Wash Strip", description: "Strip completely naked during a car wash, wait a full minute exposed, then dress again.", level: "mythical", levelOrder: 11, dareOrder: 2 },
  { slug: "the-hotel-exhibitionist", emoji: "🏨", name: "The Hotel Exhibitionist", description: "Walk completely naked in a hotel hallway.", level: "mythical", levelOrder: 11, dareOrder: 3 },
  { slug: "the-bus-masturbator", emoji: "🚌", name: "The Bus Masturbator", description: "Discreetly finger your pussy or use a small vibrator on public transportation.", level: "mythical", levelOrder: 11, dareOrder: 4 },
  { slug: "the-rideshare-flash", emoji: "🚗", name: "The Rideshare Flash", description: 'Tell your Uber/Lyft driver, "Sorry, I need to change" and strip down in the backseat.', level: "mythical", levelOrder: 11, dareOrder: 5 },
  { slug: "the-gas-pump-flash", emoji: "⛽", name: "The Gas Pump Flash", description: "Fill your gas tank while topless or completely naked under an open jacket.", level: "mythical", levelOrder: 11, dareOrder: 6 },
  { slug: "the-car-cleaner", emoji: "🧹", name: "The Car Cleaner", description: "Clean your car at a public car wash vacuum station wearing an extremely short skirt with no panties, bending over frequently.", level: "mythical", levelOrder: 11, dareOrder: 7 },
  { slug: "the-wet-t-shirt-champion", emoji: "☔", name: "The Wet T-Shirt Champion", description: "Go out in the rain wearing only a white shirt with no bra, letting your nipples show through completely.", level: "mythical", levelOrder: 11, dareOrder: 8 },

  // ── ULTIMATE ──────────────────────────────────────────────────────────────
  { slug: "the-public-prisoner", emoji: "⛓️", name: "The Public Prisoner", description: "Take a picture handcuffed (safely, with release plan) naked to a public bench.", level: "ultimate", levelOrder: 12, dareOrder: 1 },
  { slug: "the-cumwalk", emoji: "💦", name: "The Cumwalk", description: "Get a cum facial outdoors where people might see.", level: "ultimate", levelOrder: 12, dareOrder: 2 },
  { slug: "the-car-model", emoji: "🏎️", name: "The Car Model", description: "Take sexy nude photos with a luxury car you don't own.", level: "ultimate", levelOrder: 12, dareOrder: 3 },
  { slug: "the-naked-sailor", emoji: "🚣‍♀️", name: "The Naked Sailor", description: "Try paddling without bottoms, kayaking nude, or water skiing wearing just a life jacket.", level: "ultimate", levelOrder: 12, dareOrder: 4 },
  { slug: "laundry-day", emoji: "👕", name: "Laundry Day", description: "Wear minimal Sunday clothes (sweatshirt with nothing underneath, light shirt with yoga pants and no panties) to a public laundromat.", level: "ultimate", levelOrder: 12, dareOrder: 5 },
  { slug: "the-public-stripper", emoji: "👚", name: "The Public Stripper", description: "Change outfits completely in a semi-public place like a parking lot, hiking trail, or mall.", level: "ultimate", levelOrder: 12, dareOrder: 6 },
  { slug: "the-secret-rider", emoji: "🪑", name: "The Secret Rider", description: "Discretely ride a suction dildo on a public bench during daylight.", level: "ultimate", levelOrder: 12, dareOrder: 7 },

  // ── LEGENDARY CHALLENGES ──────────────────────────────────────────────────
  { slug: "the-elevator-stripper", emoji: "🛗", name: "The Elevator Stripper", description: "Find an elevator, wear 4+ pieces of clothing, ride up, remove each item and take a pic for each one, get on all fours while waiting for it to move, then try to get dressed before the doors open!", level: "legendary_challenges", levelOrder: 13, dareOrder: 1 },
  { slug: "the-stairway-to-heaven", emoji: "🪜", name: "The Stairway to Heaven", description: "Find a stairwell, remove one piece of clothing at each floor, leave it there, and take a picture. Continue until you're completely nude.", level: "legendary_challenges", levelOrder: 13, dareOrder: 2 },
  { slug: "the-home-store-shocker", emoji: "🛁", name: "The Home Store Shocker", description: "Get naked in a display shower or bathroom at IKEA or similar store. Try keeping just a towel for quick coverage.", level: "legendary_challenges", levelOrder: 13, dareOrder: 3 },
  { slug: "the-mouthful", emoji: "📞", name: "The Mouthful", description: "Have a casual phone conversation while sucking a dildo or giving a real blowjob.", level: "legendary_challenges", levelOrder: 13, dareOrder: 4 },
  { slug: "full-frontal-freedom", emoji: "🚶‍♀️", name: "Full Frontal Freedom", description: "Take a completely naked walk outdoors.", level: "legendary_challenges", levelOrder: 13, dareOrder: 5 },
  { slug: "the-snowblower", emoji: "❄️", name: "The Snowblower", description: "Give a blowjob while naked in the snow.", level: "legendary_challenges", levelOrder: 13, dareOrder: 6 },
  { slug: "the-carwash-cumshot", emoji: "🚿", name: "The Carwash Cumshot", description: "Make someone cum during a car wash.", level: "legendary_challenges", levelOrder: 13, dareOrder: 7 },
  { slug: "the-naked-driver", emoji: "🚗", name: "The Naked Driver", description: "Record yourself putting all your clothes in your car trunk and then driving naked.", level: "legendary_challenges", levelOrder: 13, dareOrder: 8 },
  { slug: "the-delivery-surprise", emoji: "🍕", name: "The Delivery Surprise", description: "The famous pizza delivery dare - answer the door nearly naked or flash during delivery.", level: "legendary_challenges", levelOrder: 13, dareOrder: 9 },
  { slug: "the-stuffed-patron", emoji: "🍸", name: "The Stuffed Patron", description: "Go get a drink at a bar with a dildo inside your pussy. Bonus if it's remote-controlled.", level: "legendary_challenges", levelOrder: 13, dareOrder: 10 },
  { slug: "the-cumwalk-2", emoji: "💦", name: "The Cumwalk (After Sex)", description: "Take a public walk after sex without cleaning up the cum.", level: "legendary_challenges", levelOrder: 13, dareOrder: 11 },
  { slug: "the-xxx-try-on", emoji: "👙", name: "The XXX Try-On", description: "Try on outfits in a creepy adult store changing room.", level: "legendary_challenges", levelOrder: 13, dareOrder: 12 },
  { slug: "mile-high-service", emoji: "✈️", name: "Mile High Service", description: "Help someone join the mile-high club from a plane seat.", level: "legendary_challenges", levelOrder: 13, dareOrder: 13 },
  { slug: "the-secret-fuck", emoji: "🪑", name: "The Secret Fuck", description: "On a public bench, wearing a dress, sit on your partner's lap and fuck them discreetly, hidden by the dress.", level: "legendary_challenges", levelOrder: 13, dareOrder: 14 },
  { slug: "the-alpha-slut", emoji: "🔤", name: "The Alpha Slut", description: "Create an album with a sexy/risky photo for each letter of the alphabet. A is for ass, B is for boobs, C is for clit, etc.", level: "legendary_challenges", levelOrder: 13, dareOrder: 15 },
  { slug: "the-sky-high-exhibitionist", emoji: "✈️", name: "The Sky High Exhibitionist", description: "Get completely naked at your airplane seat (extremely risky).", level: "legendary_challenges", levelOrder: 13, dareOrder: 16 },
  { slug: "the-mall-slut", emoji: "🛍️", name: "The Mall Slut", description: "Complete the full mall challenge from r/stupidslutsclub (details in community archives).", level: "legendary_challenges", levelOrder: 13, dareOrder: 17 },
];

/** Map for O(1) lookup by slug */
export const PLAYBOOK_BY_SLUG = new Map<string, PlaybookDare>(
  PLAYBOOK_DARES.map((d) => [d.slug, d])
);

/**
 * Fuzzy-match a post title+body against all playbook dares.
 * Returns the best matching dare (score >= 3) or null.
 *
 * Scoring:
 *   +10  dare name found verbatim in text (case-insensitive)
 *   +5   emoji found in text
 *   +2   per significant word from dare name found in text
 */
export function matchPlaybookDare(text: string): PlaybookDare | null {
  const normalised = text.toLowerCase().replace(/['']/g, "'");
  let best: PlaybookDare | null = null;
  let bestScore = 2; // minimum threshold

  for (const dare of PLAYBOOK_DARES) {
    let score = 0;
    const normName = dare.name.toLowerCase();

    // Exact name match
    if (normalised.includes(normName)) score += 10;

    // Emoji match (emoji are unicode, simple includes works)
    if (text.includes(dare.emoji)) score += 5;

    // Significant word matches (skip words ≤ 3 chars)
    if (score < 10) {
      const words = normName.split(/\s+/).filter((w) => w.length > 3);
      for (const word of words) {
        if (normalised.includes(word)) score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = dare;
    }
  }

  return best;
}

/** Returns all dares grouped by level in order */
export function getDaresByLevel(): Map<PlaybookLevel, PlaybookDare[]> {
  const map = new Map<PlaybookLevel, PlaybookDare[]>();
  for (const dare of PLAYBOOK_DARES) {
    const group = map.get(dare.level) ?? [];
    group.push(dare);
    map.set(dare.level, group);
  }
  return map;
}
