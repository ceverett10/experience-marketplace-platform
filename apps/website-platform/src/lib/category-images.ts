/**
 * Maps broad category groups to relevant Unsplash images.
 * Used as fallback when a category doesn't have a custom imageUrl.
 *
 * Each entry has keywords that match against category names (case-insensitive),
 * ordered from most specific to most generic so the first match wins.
 */

interface CategoryImage {
  imageUrl: string;
  imageAttribution: {
    photographerName: string;
    photographerUrl: string;
    unsplashUrl: string;
  };
}

const UTM = 'utm_source=experience_marketplace&utm_medium=referral';

const CATEGORY_IMAGE_GROUPS: Array<{ keywords: string[]; image: CategoryImage }> = [
  // Food & drink
  {
    keywords: [
      'food',
      'drink',
      'culinary',
      'cooking',
      'wine',
      'beer',
      'coffee',
      'dining',
      'restaurant',
      'market',
      'tasting',
      'paella',
      'street food',
    ],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Lily Banse',
        photographerUrl: `https://unsplash.com/@lvnatikk?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Water activities
  {
    keywords: [
      'water',
      'boat',
      'sailing',
      'kayak',
      'snorkel',
      'diving',
      'surf',
      'jet ski',
      'whale',
      'raft',
      'cruise',
      'fishing',
      'aqua',
    ],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1530053969600-caed2596d242?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Ishan Seefromthesky',
        photographerUrl: `https://unsplash.com/@seefromthesky?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Adventure & outdoor
  {
    keywords: [
      'adventure',
      'hiking',
      'climbing',
      'zip line',
      'bungee',
      'skydiving',
      'paragliding',
      'quad',
      'atv',
      'safari',
      'desert',
    ],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1533692328991-08159ff19fca?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Dino Reichmuth',
        photographerUrl: `https://unsplash.com/@dinoreichmuth?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Culture, history & museums
  {
    keywords: [
      'culture',
      'history',
      'heritage',
      'museum',
      'architecture',
      'historical',
      'religious',
      'spiritual',
      'literary',
      'exhibition',
    ],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Matteo Vistocco',
        photographerUrl: `https://unsplash.com/@mrsunflower94?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Nature & wildlife
  {
    keywords: ['nature', 'wildlife', 'bird', 'garden', 'eco', 'natural'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Luca Bravo',
        photographerUrl: `https://unsplash.com/@lucabravo?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Entertainment & nightlife
  {
    keywords: [
      'nightlife',
      'show',
      'performance',
      'theme park',
      'escape room',
      'music',
      'comedy',
      'entertainment',
      'dance',
      'flamenco',
      'theatre',
    ],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Austin Neill',
        photographerUrl: `https://unsplash.com/@arstyy?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Wellness & spa
  {
    keywords: ['spa', 'wellness', 'yoga', 'meditation', 'hot springs', 'relaxation'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Alan Caishan',
        photographerUrl: `https://unsplash.com/@caishan0831?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Snow & winter
  {
    keywords: ['ski', 'snow', 'snowmobile', 'winter'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1551524559-8af4e6624178?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Maarten Duineveld',
        photographerUrl: `https://unsplash.com/@maartenduineveld?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Aerial & helicopter
  {
    keywords: ['helicopter', 'hot air balloon', 'balloon', 'aerial'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Daniela Cuevas',
        photographerUrl: `https://unsplash.com/@danielacuevas?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Family & kids
  {
    keywords: ['family', 'kids', 'children'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Jonathan Borba',
        photographerUrl: `https://unsplash.com/@jonathanborba?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Romantic & couples
  {
    keywords: ['romantic', 'couple'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1529903384028-629a8ba3d9db?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Scott Broome',
        photographerUrl: `https://unsplash.com/@scottbroome?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Day trips & excursions
  {
    keywords: ['day trip', 'excursion', 'shore'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Luca Bravo',
        photographerUrl: `https://unsplash.com/@lucabravo?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Transport & transfers
  {
    keywords: ['transfer', 'transport', 'shuttle', 'airport', 'port', 'hop-on', 'bus', 'train'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Alexander Popov',
        photographerUrl: `https://unsplash.com/@5tep5?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Cycling & bike
  {
    keywords: ['cycling', 'bike', 'biking', 'segway', 'scooter'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Dovile Ramoskaite',
        photographerUrl: `https://unsplash.com/@dovilerm?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Walking tours & sightseeing (broad — keep near end)
  {
    keywords: ['walking', 'sightseeing', 'city tour', 'local tour', 'tour', 'guided'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Florian Wehde',
        photographerUrl: `https://unsplash.com/@florianwehde?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Tickets & passes
  {
    keywords: ['ticket', 'pass', 'skip the line', 'observation'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Aditya Chinchure',
        photographerUrl: `https://unsplash.com/@adityachinchure?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
  // Classes & workshops
  {
    keywords: ['class', 'workshop', 'lesson', 'learn'],
    image: {
      imageUrl:
        'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=80&fit=crop&auto=format',
      imageAttribution: {
        photographerName: 'Jason Briscoe',
        photographerUrl: `https://unsplash.com/@jasonbriscoe?${UTM}`,
        unsplashUrl: `https://unsplash.com/?${UTM}`,
      },
    },
  },
];

/** Generic fallback when no keyword matches. */
const FALLBACK_IMAGE: CategoryImage = {
  imageUrl:
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80&fit=crop&auto=format',
  imageAttribution: {
    photographerName: 'Annie Spratt',
    photographerUrl: `https://unsplash.com/@anniespratt?${UTM}`,
    unsplashUrl: `https://unsplash.com/?${UTM}`,
  },
};

/**
 * Get a relevant Unsplash image for a category name.
 * Matches keywords against the category name (case-insensitive).
 * Returns the first matching group's image, or a generic travel fallback.
 */
export function getCategoryImage(categoryName: string): CategoryImage {
  const lower = categoryName.toLowerCase();
  for (const group of CATEGORY_IMAGE_GROUPS) {
    if (group.keywords.some((kw) => lower.includes(kw))) {
      return group.image;
    }
  }
  return FALLBACK_IMAGE;
}
