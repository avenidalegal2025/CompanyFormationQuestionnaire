export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  price: number; // in cents
  required: boolean;
  category: 'formation' | 'address' | 'phone' | 'agreement' | 'workspace';
}

export interface PricingPackage {
  id: string;
  name: string;
  description: string;
  basePrice: number; // in cents
  services: ServiceItem[];
  popular?: boolean;
}

// Precios de formación por estado y tipo de entidad
export const FORMATION_PRICES: { [entityType: string]: { [state: string]: number } } = {
  'LLC': {
    'Florida': 60000, // $600
    'Delaware': 69500, // $695
    'Wyoming': 62500, // $625
    'Texas': 78500, // $785
    'Nevada': 102500, // $1025
    'New Mexico': 57500, // $575
    'California': 69500, // $695
    'Georgia': 58500, // $585
    'Arizona': 60000, // $600
  },
  'C-Corp': {
    'Florida': 79500, // $795
    'Delaware': 96500, // $965
    'Wyoming': 85000, // $850
    'Texas': 103500, // $1035
    'Nevada': 127500, // $1275
    'New Mexico': 82500, // $825
    'California': 94500, // $945
    'Georgia': 83500, // $835
    'Arizona': 85000, // $850
  }
};

export const SERVICES: ServiceItem[] = [
  {
    id: 'business_address',
    name: 'Dirección Comercial en EE. UU.',
    description: 'Servicio de agente registrado y dirección comercial en EE. UU. por 1 año',
    price: 60000, // $600
    required: false,
    category: 'address'
  },
  {
    id: 'business_phone',
    name: 'Número de Teléfono en EE. UU.',
    description: 'Número de teléfono en EEUU con desvío de llamadas por un año',
    price: 18000, // $180
    required: false,
    category: 'phone'
  },
  {
    id: 'operating_agreement',
    name: 'Acuerdo Operativo (LLC)',
    description: 'Preparación de acuerdo operativo personalizado para su LLC',
    price: 60000, // $600
    required: false,
    category: 'agreement'
  },
  {
    id: 'shareholder_agreement',
    name: 'Acuerdo de Accionistas (C-Corp)',
    description: 'Preparación de acuerdo de accionistas personalizado para su C-Corp',
    price: 60000, // $600
    required: false,
    category: 'agreement'
  },
  {
    id: 'google_workspace',
    name: 'Google Workspace',
    description: 'Correo profesional con Gmail, Google Drive, Meet y más por 1 año',
    price: 15000, // $150
    required: false,
    category: 'workspace'
  }
];

export const PACKAGES: PricingPackage[] = [
  {
    id: 'basic',
    name: 'Formación Básica',
    description: 'Servicio esencial de formación de empresa',
    basePrice: 0,
    services: [],
    popular: false
  },
  {
    id: 'complete',
    name: 'Paquete Completo',
    description: 'Todo lo que necesitas para iniciar tu negocio en EE. UU.',
    basePrice: 0,
    services: [
      SERVICES.find(s => s.id === 'business_address')!,
      SERVICES.find(s => s.id === 'business_phone')!,
      SERVICES.find(s => s.id === 'operating_agreement')!,
    ],
    popular: true
  },
  {
    id: 'premium',
    name: 'Paquete Premium',
    description: 'Configuración completa de C-Corporación con todas las características',
    basePrice: 0,
    services: [
      SERVICES.find(s => s.id === 'business_address')!,
      SERVICES.find(s => s.id === 'business_phone')!,
      SERVICES.find(s => s.id === 'shareholder_agreement')!,
    ],
    popular: false
  }
];

export function calculateTotalPrice(
  selectedServices: string[], 
  entityType: 'LLC' | 'C-Corp', 
  state: string,
  hasUsAddress: boolean = false,
  hasUsPhone: boolean = false,
  skipAgreement: boolean = false
): number {
  let total = 0;
  
  // Add formation service based on entity type and state
  const formationPrice = FORMATION_PRICES[entityType]?.[state];
  if (formationPrice) {
    total += formationPrice;
  } else {
    console.warn(`No formation price found for ${entityType} in ${state}. Using default.`);
    // Fallback to default prices
    total += entityType === 'LLC' ? 60000 : 80000; // $600 or $800
  }
  
  // Add other selected services
  selectedServices.forEach(serviceId => {
    const service = SERVICES.find(s => s.id === serviceId);
    if (service) {
      // Skip address if user already has one
      if (serviceId === 'business_address' && hasUsAddress) {
        return;
      }
      // Skip phone if user already has one
      if (serviceId === 'business_phone' && hasUsPhone) {
        return;
      }
      // Skip agreement if user chose to skip
      if (skipAgreement && (serviceId === 'operating_agreement' || serviceId === 'shareholder_agreement')) {
        return;
      }
      total += service.price;
    }
  });
  
  return total;
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}
