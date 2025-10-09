export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  price: number; // in cents
  required: boolean;
  category: 'formation' | 'address' | 'phone' | 'agreement';
}

export interface PricingPackage {
  id: string;
  name: string;
  description: string;
  basePrice: number; // in cents
  services: ServiceItem[];
  popular?: boolean;
}

export const SERVICES: ServiceItem[] = [
  {
    id: 'llc_formation',
    name: 'LLC Formation',
    description: 'Complete LLC formation with state filing and documentation',
    price: 29900, // $299
    required: true,
    category: 'formation'
  },
  {
    id: 'corp_formation',
    name: 'C-Corp Formation',
    description: 'Complete C-Corporation formation with state filing and documentation',
    price: 39900, // $399
    required: true,
    category: 'formation'
  },
  {
    id: 'business_address',
    name: 'US Business Address',
    description: 'Registered agent service and business address for 1 year',
    price: 19900, // $199
    required: false,
    category: 'address'
  },
  {
    id: 'business_phone',
    name: 'US Business Phone',
    description: 'Virtual business phone number with call forwarding',
    price: 9900, // $99
    required: false,
    category: 'phone'
  },
  {
    id: 'operating_agreement',
    name: 'Operating Agreement',
    description: 'Custom LLC Operating Agreement preparation',
    price: 14900, // $149
    required: false,
    category: 'agreement'
  },
  {
    id: 'shareholder_agreement',
    name: 'Shareholder Agreement',
    description: 'Custom C-Corp Shareholder Agreement preparation',
    price: 14900, // $149
    required: false,
    category: 'agreement'
  }
];

export const PACKAGES: PricingPackage[] = [
  {
    id: 'basic',
    name: 'Basic Formation',
    description: 'Essential company formation service',
    basePrice: 0,
    services: [
      SERVICES.find(s => s.id === 'llc_formation')!,
    ],
    popular: false
  },
  {
    id: 'complete',
    name: 'Complete Package',
    description: 'Everything you need to start your US business',
    basePrice: 0,
    services: [
      SERVICES.find(s => s.id === 'llc_formation')!,
      SERVICES.find(s => s.id === 'business_address')!,
      SERVICES.find(s => s.id === 'business_phone')!,
      SERVICES.find(s => s.id === 'operating_agreement')!,
    ],
    popular: true
  },
  {
    id: 'premium',
    name: 'Premium Package',
    description: 'Full-service C-Corporation setup with all features',
    basePrice: 0,
    services: [
      SERVICES.find(s => s.id === 'corp_formation')!,
      SERVICES.find(s => s.id === 'business_address')!,
      SERVICES.find(s => s.id === 'business_phone')!,
      SERVICES.find(s => s.id === 'shareholder_agreement')!,
    ],
    popular: false
  }
];

export function calculateTotalPrice(selectedServices: string[], entityType: 'LLC' | 'C-Corp'): number {
  let total = 0;
  
  // Add formation service based on entity type
  const formationService = entityType === 'LLC' ? 'llc_formation' : 'corp_formation';
  const formationPrice = SERVICES.find(s => s.id === formationService)?.price || 0;
  total += formationPrice;
  
  // Add other selected services
  selectedServices.forEach(serviceId => {
    if (serviceId !== formationService) {
      const service = SERVICES.find(s => s.id === serviceId);
      if (service) {
        total += service.price;
      }
    }
  });
  
  return total;
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}
