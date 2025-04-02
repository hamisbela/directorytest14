import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import slugify from 'slugify';

interface BeautySalon {
  id: string;
  title: string;
  website?: string;
  telephone?: string;
  address?: string;
  postal_code?: string;
  latitude?: string;
  longitude?: string;
  email?: string;
  opening_hours?: string;
  description?: string;
  service_product?: string;
  reviews?: string;
  average_star?: string;
  city_id?: string;
  city_name?: string;
  state_id?: string;
  state_name?: string;
  category_ids?: string;
  detail_keys?: string;
  detail_values?: string;
  amenity_ids?: string;
  payment_ids?: string;
  images?: string;
}

interface City {
  id: string;
  city: string;
  state_id: string;
  state_name?: string;
  salon_count?: number;
}

interface State {
  id: string;
  state: string;
  city_count?: number;
  salon_count?: number;
}

interface Category {
  id: string;
  category: string;
  salon_count?: number;
}

async function readCsvFromZip(zipPath: string, csvFileName: string): Promise<any[]> {
  try {
    const zip = new AdmZip(zipPath);
    const zipEntry = zip.getEntry(csvFileName);
    
    if (!zipEntry) {
      throw new Error(`CSV file ${csvFileName} not found in zip archive.`);
    }
    
    return new Promise((resolve, reject) => {
      const csvData: any[] = [];
      Readable.from(zipEntry.getData())
        .pipe(csvParser())
        .on('data', (row) => csvData.push(row))
        .on('end', () => resolve(csvData))
        .on('error', (error) => reject(error));
    });
  } catch (error) {
    console.error(`Error reading ${csvFileName} from zip:`, error);
    throw error;
  }
}

function generateHTMLHeader(title: string, description: string, hasCoordinates = false): string {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${description}">
    <title>${title} - Electrolysis Directory</title>
    <link rel="icon" href="/favicon.ico">
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    ${hasCoordinates ? `
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    ` : ''}
  </head>
  <body>
    <header>
      <div class="container">
        <nav>
          <a href="/" class="logo">Electrolysis Directory</a>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/about/">About</a></li>
            <li><a href="/contact/">Contact</a></li>
            <li><a href="/add-listing/" class="cta">Add Listing</a></li>
          </ul>
        </nav>
      </div>
    </header>
    <main>`;
}

function generateHTMLFooter(hasCoordinates = false, latitude = "", longitude = "", businessName = ""): string {
  return `
    </main>
    <footer>
      <div class="container">
        <div class="footer-content">
          <div class="footer-section">
            <h3>Electrolysis Directory</h3>
            <p>Find the best electrolysis providers in your area.</p>
          </div>
          <div class="footer-section">
            <h3>Quick Links</h3>
            <ul>
              <li><a href="/">Home</a></li>
              <li><a href="/about/">About</a></li>
              <li><a href="/contact/">Contact</a></li>
              <li><a href="/add-listing/">Add Listing</a></li>
            </ul>
          </div>
          <div class="footer-section">
            <h3>Contact</h3>
            <p>Email: info@electrolysisdirectory.com</p>
            <p>Phone: (555) 123-4567</p>
          </div>
        </div>
        <div class="copyright">
          <p>&copy; ${new Date().getFullYear()} Electrolysis Directory. All rights reserved.</p>
        </div>
      </div>
    </footer>
    ${hasCoordinates ? `
    <script>
      const map = L.map('map').setView([${latitude}, ${longitude}], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      L.marker([${latitude}, ${longitude}]).addTo(map)
        .bindPopup('<strong>${businessName.replace(/'/g, "\\'")}</strong>')
        .openPopup();
    </script>
    ` : ''}
  </body>
  </html>`;
}

function formatOpeningHours(hoursString: string): string {
  if (!hoursString) return 'Hours not provided';
  
  // Check if hours are in the expected format with quotes
  if (hoursString.includes('"')) {
    try {
      // Try to parse the hours as a formatted list
      const hoursList = hoursString.split('","')
        .map(h => h.replace(/"/g, ''))
        .map(h => {
          // Try to split into day and hours
          const match = h.match(/^([A-Za-z-]+)\s+(\d.+)$/);
          if (match) {
            const [_, day, hours] = match;
            // Format day names
            const formattedDay = {
              'Mo': 'Monday',
              'Tu': 'Tuesday',
              'We': 'Wednesday',
              'Th': 'Thursday',
              'Fr': 'Friday',
              'Sa': 'Saturday',
              'Su': 'Sunday'
            }[day] || day;
            
            return `<tr><td class="day">${formattedDay}</td><td>${hours}</td></tr>`;
          }
          return `<tr><td colspan="2">${h}</td></tr>`;
        })
        .join('');
      
      return `<table class="hours-table">${hoursList}</table>`;
    } catch (e) {
      // If parsing fails, just return the raw string
      return hoursString;
    }
  }
  
  return hoursString;
}

function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  
  // Simple formatting to handle common US formats
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6, 10)}`;
  }
  return phone;
}

function renderStarRating(rating: string): string {
  if (!rating) return 'No ratings yet';
  
  const numericRating = parseFloat(rating);
  if (isNaN(numericRating)) return 'Rating not available';
  
  let starsHtml = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= numericRating) {
      starsHtml += '<i class="fas fa-star"></i>';
    } else if (i - 0.5 <= numericRating) {
      starsHtml += '<i class="fas fa-star-half-alt"></i>';
    } else {
      starsHtml += '<i class="far fa-star"></i>';
    }
  }
  
  return starsHtml;
}

function formatServices(services: string): string {
  if (!services) return '';
  
  // Try to detect if services are already in a list format
  if (services.includes(',')) {
    return services.split(',')
      .map(service => service.trim())
      .filter(service => service.length > 0)
      .map(service => `<li class="service-item"><span class="service-icon"><i class="fas fa-check-circle"></i></span>${service}</li>`)
      .join('');
  }
  
  // Try to detect if services are separated by line breaks
  if (services.includes('\n')) {
    return services.split('\n')
      .map(service => service.trim())
      .filter(service => service.length > 0)
      .map(service => `<li class="service-item"><span class="service-icon"><i class="fas fa-check-circle"></i></span>${service}</li>`)
      .join('');
  }
  
  // Otherwise, just return the services as a paragraph
  return `<p>${services}</p>`;
}

async function generateHTML() {
  console.log('Starting HTML generation...');
  
  try {
    const zipPath = path.join(process.cwd(), 'data', 'data.zip');
    const outputDir = path.join(process.cwd(), 'public');
    const dataOutputDir = path.join(outputDir, 'data');
    
    // Create output directories
    await fs.ensureDir(outputDir);
    await fs.ensureDir(dataOutputDir);
    await fs.ensureDir(path.join(outputDir, 'companies'));
    await fs.ensureDir(path.join(outputDir, 'cities'));
    await fs.ensureDir(path.join(outputDir, 'states'));
    await fs.ensureDir(path.join(outputDir, 'categories'));
    await fs.ensureDir(path.join(outputDir, 'sitemap')); // Ensure sitemap directory exists
    
    // Read data from zip
    const beautySalons = await readCsvFromZip(zipPath, 'beauty_salon.csv') as BeautySalon[];
    const cities = await readCsvFromZip(zipPath, 'city.csv') as City[];
    const states = await readCsvFromZip(zipPath, 'state.csv') as State[];
    const categories = await readCsvFromZip(zipPath, 'category.csv') as Category[];
    
    console.log(`Read ${beautySalons.length} beauty salons, ${cities.length} cities, ${states.length} states, and ${categories.length} categories.`);
    
    // Create maps for easy lookups
    const citiesMap = new Map(cities.map(city => [city.id, city]));
    const statesMap = new Map(states.map(state => [state.id, state]));
    const categoriesMap = new Map(categories.map(category => [category.id, category]));
    
    // Add state names to cities
    cities.forEach(city => {
      if (city.state_id && statesMap.has(city.state_id)) {
        city.state_name = statesMap.get(city.state_id)!.state;
      }
    });
    
    // Add city and state IDs to salons if missing
    beautySalons.forEach(salon => {
      // First try to assign city and state based on city_id
      if (salon.city_id && citiesMap.has(salon.city_id)) {
        const city = citiesMap.get(salon.city_id)!;
        salon.city_name = city.city;
        
        if (city.state_id && statesMap.has(city.state_id)) {
          salon.state_id = city.state_id;
          salon.state_name = statesMap.get(city.state_id)!.state;
        }
      }
      
      // If we still don't have state, try to infer from address
      if (salon.address && (!salon.state_id || !salon.state_name)) {
        const addressParts = salon.address.split(',').map(part => part.trim());
        if (addressParts.length >= 2) {
          // Try to find state by abbreviation (assuming US address format)
          const stateAbbreviation = addressParts[addressParts.length - 2].split(' ').pop();
          
          if (stateAbbreviation && stateAbbreviation.length === 2) {
            // Find state by name
            for (const [id, state] of statesMap.entries()) {
              // This is just a simple matching, in a real app you'd use a state abbreviation lookup
              if (state.state.substring(0, 2).toUpperCase() === stateAbbreviation.toUpperCase()) {
                salon.state_id = id;
                salon.state_name = state.state;
                break;
              }
            }
          }
        }
      }
      
      // If we still don't have city and it's in the address, try to extract it
      if (salon.address && !salon.city_name) {
        const addressParts = salon.address.split(',').map(part => part.trim());
        if (addressParts.length >= 3) {
          const possibleCity = addressParts[addressParts.length - 3];
          
          // Find matching city
          for (const [id, city] of citiesMap.entries()) {
            if (city.city.toLowerCase() === possibleCity.toLowerCase()) {
              salon.city_id = id;
              salon.city_name = city.city;
              
              // If city has a state and salon doesn't, use the city's state
              if (city.state_id && !salon.state_id) {
                salon.state_id = city.state_id;
                if (statesMap.has(city.state_id)) {
                  salon.state_name = statesMap.get(city.state_id)!.state;
                }
              }
              break;
            }
          }
        }
      }
    });
    
    // Count salons per city, state, and category
    beautySalons.forEach(salon => {
      // Count for cities
      if (salon.city_id && citiesMap.has(salon.city_id)) {
        const city = citiesMap.get(salon.city_id)!;
        city.salon_count = (city.salon_count || 0) + 1;
      }
      
      // Count for states
      if (salon.state_id && statesMap.has(salon.state_id)) {
        const state = statesMap.get(salon.state_id)!;
        state.salon_count = (state.salon_count || 0) + 1;
      }
      
      // Count for categories
      if (salon.category_ids) {
        salon.category_ids.split(',').forEach(categoryId => {
          if (categoriesMap.has(categoryId)) {
            const category = categoriesMap.get(categoryId)!;
            category.salon_count = (category.salon_count || 0) + 1;
          }
        });
      }
    });
    
    // Count cities per state
    cities.forEach(city => {
      if (city.state_id && statesMap.has(city.state_id)) {
        const state = statesMap.get(city.state_id)!;
        state.city_count = (state.city_count || 0) + 1;
      }
    });
    
    // Process data for the frontend
    const processedSalons = beautySalons.map(salon => {
      // Create slug for URL - Fix for missing state info
      const citySlug = salon.city_name ? slugify(salon.city_name, { lower: true }) : 'unknown-city';
      
      // Create proper state slug - avoid 'unknown-state' when possible
      let stateSlug;
      if (salon.state_name) {
        stateSlug = slugify(salon.state_name, { lower: true });
      } else if (salon.city_id && citiesMap.has(salon.city_id)) {
        const city = citiesMap.get(salon.city_id)!;
        if (city.state_id && statesMap.has(city.state_id)) {
          const state = statesMap.get(city.state_id)!;
          stateSlug = slugify(state.state, { lower: true });
          salon.state_name = state.state;  // Update the salon's missing state name
        } else {
          stateSlug = 'us';  // Default to 'us' instead of 'unknown-state'
        }
      } else {
        stateSlug = 'us';  // Better fallback than 'unknown-state'
      }
      
      const slug = slugify(`${citySlug}-${stateSlug}-${salon.title}-${salon.id}`, { lower: true });
      
      return {
        id: salon.id,
        title: salon.title,
        slug,
        website: salon.website,
        telephone: salon.telephone,
        address: salon.address,
        postal_code: salon.postal_code,
        latitude: salon.latitude,
        longitude: salon.longitude,
        email: salon.email,
        opening_hours: salon.opening_hours,
        description: salon.description,
        service_product: salon.service_product,
        reviews: salon.reviews,
        average_star: salon.average_star,
        city_id: salon.city_id,
        city_name: salon.city_name,
        state_id: salon.state_id,
        state_name: salon.state_name,
        category_ids: salon.category_ids ? salon.category_ids.split(',') : [],
        detail_keys: salon.detail_keys ? salon.detail_keys.split(',') : [],
        detail_values: salon.detail_values ? salon.detail_values.split(',') : [],
        amenity_ids: salon.amenity_ids ? salon.amenity_ids.split(',') : [],
        payment_ids: salon.payment_ids ? salon.payment_ids.split(',') : [],
        images: salon.images ? salon.images.split(',') : []
      };
    });
    
    // For debugging - log the first few salons with their city and state IDs
    for (let i = 0; i < Math.min(5, processedSalons.length); i++) {
      const salon = processedSalons[i];
      console.log(`Salon ${i+1}: "${salon.title}" - City: ${salon.city_name}, State: ${salon.state_name}`);
    }
    
    const processedCities = cities.map(city => {
      // Create slug for URL
      const slug = slugify(`${city.city}-${city.state_id}`, { lower: true });
      
      // Find salons for this city
      const citySlug = slugify(city.city, { lower: true });
      const salonIdsForCity = processedSalons
        .filter(salon => {
          // Match by city_id if available
          if (salon.city_id && salon.city_id === city.id) {
            return true;
          }
          
          // Match by city_name as fallback (case insensitive comparison)
          if (salon.city_name && salon.city_name.toLowerCase() === city.city.toLowerCase()) {
            return true;
          }
          
          return false;
        })
        .map(salon => salon.id);
      
      return {
        id: city.id,
        city: city.city,
        slug,
        state_id: city.state_id,
        state_name: city.state_name,
        salon_ids: salonIdsForCity
      };
    });
    
    // For debugging - log cities with salon counts
    for (let i = 0; i < Math.min(5, processedCities.length); i++) {
      const city = processedCities[i];
      console.log(`City ${i+1}: "${city.city}" - Salon count: ${city.salon_ids.length}`);
    }
    
    const processedStates = states.map(state => {
      // Create slug for URL
      const slug = slugify(state.state, { lower: true });
      
      // Find city IDs for this state
      const cityIdsForState = processedCities
        .filter(city => city.state_id === state.id)
        .map(city => city.id);
      
      // Find salons for this state
      const salonIdsForState = processedSalons
        .filter(salon => {
          // Match by state_id if available
          if (salon.state_id && salon.state_id === state.id) {
            return true;
          }
          
          // Match by state_name as fallback (case insensitive comparison)
          if (salon.state_name && salon.state_name.toLowerCase() === state.state.toLowerCase()) {
            return true;
          }
          
          // Match by city_id being in a city that belongs to this state
          if (salon.city_id && cityIdsForState.includes(salon.city_id)) {
            return true;
          }
          
          return false;
        })
        .map(salon => salon.id);
      
      return {
        id: state.id,
        state: state.state,
        slug,
        city_ids: cityIdsForState,
        salon_ids: salonIdsForState
      };
    });
    
    // For debugging - log states with salon and city counts
    for (let i = 0; i < Math.min(5, processedStates.length); i++) {
      const state = processedStates[i];
      console.log(`State ${i+1}: "${state.state}" - Cities: ${state.city_ids.length}, Salons: ${state.salon_ids.length}`);
    }
    
    const processedCategories = categories.map(category => {
      // Create slug for URL
      const slug = slugify(category.category, { lower: true });
      
      return {
        id: category.id,
        category: category.category,
        slug,
        salon_ids: processedSalons
          .filter(salon => salon.category_ids.includes(category.id))
          .map(salon => salon.id)
      };
    });
    
    // Save processed data as JSON for frontend use
    await fs.writeJson(path.join(dataOutputDir, 'salons.json'), processedSalons);
    await fs.writeJson(path.join(dataOutputDir, 'cities.json'), processedCities);
    await fs.writeJson(path.join(dataOutputDir, 'states.json'), processedStates);
    await fs.writeJson(path.join(dataOutputDir, 'categories.json'), processedCategories);
    
    console.log('Generated JSON data files.');

    // Generate HTML for beauty salon pages
    let generatedCompanyPages = 0;
    for (const salon of processedSalons) {
      // Check if we have valid coordinates for a map
      const hasCoordinates = salon.latitude && salon.longitude && 
                            !isNaN(parseFloat(salon.latitude)) && 
                            !isNaN(parseFloat(salon.longitude));
                            
      // Get categories this salon belongs to
      const salonCategories = salon.category_ids
        .map(id => categoriesMap.get(id))
        .filter(Boolean)
        .map(cat => cat!.category);
        
      // Format phone number for display
      const formattedPhone = formatPhoneNumber(salon.telephone || '');
      
      // Format opening hours for display
      const formattedHours = formatOpeningHours(salon.opening_hours || '');
      
      // Generate star rating HTML if available
      const ratingHtml = renderStarRating(salon.average_star || '');
      
      // Format services if available
      const servicesHtml = formatServices(salon.service_product || '');
        
      // Generate company page HTML
      let html = generateHTMLHeader(
        salon.title, 
        salon.description || `Professional electrolysis services at ${salon.title}`,
        hasCoordinates
      );
      
      // Add custom CSS for company pages
      html += `
      <style>
        /* Banner header */
        .company-banner {
          position: relative;
          background-color: #009688;
          color: white;
          padding: 2rem 0;
          background-image: linear-gradient(135deg, rgba(0, 150, 136, 0.9), rgba(0, 77, 64, 0.9)), url('https://images.unsplash.com/photo-1595503240812-7286dafaddc1?ixlib=rb-4.0.3&q=80&w=1080&auto=format');
          background-size: cover;
          background-position: center;
        }
        
        .company-banner h1 {
          font-size: 2.5rem;
          color: white;
          margin-bottom: 0.5rem;
          max-width: 70%;
        }
        
        .company-banner .location {
          display: flex;
          align-items: center;
          color: rgba(255, 255, 255, 0.9);
          font-size: 1.1rem;
        }
        
        .company-banner .location i {
          margin-right: 0.5rem;
        }
        
        /* Main content layout */
        .content-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 2rem;
          margin-top: 2rem;
        }
        
        @media (min-width: 768px) {
          .content-grid {
            grid-template-columns: 2fr 1fr;
          }
        }
        
        /* Contact info */
        .contact-info {
          margin-bottom: 2rem;
        }
        
        .contact-info-item {
          display: flex;
          align-items: flex-start;
          margin-bottom: 1rem;
          color: #4a4a4a;
        }
        
        .contact-info-item i {
          width: 20px;
          margin-right: 1rem;
          color: #009688;
        }
        
        .contact-info-item a {
          color: #009688;
          text-decoration: none;
        }
        
        .contact-info-item a:hover {
          text-decoration: underline;
        }
        
        /* Business details */
        .business-details {
          background-color: white;
          border-radius: 0.5rem;
          padding: 1.5rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          margin-bottom: 2rem;
        }
        
        .business-details h2 {
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 0.75rem;
          margin-bottom: 1rem;
          color: #2d3748;
        }
        
        /* Services */
        .services-list {
          margin-top: 1.5rem;
        }
        
        .service-item {
          display: flex;
          align-items: flex-start;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .service-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        
        .service-icon {
          margin-right: 1rem;
          color: #009688;
        }
        
        /* Business meta info */
        .business-meta {
          background-color: #f8f9fa;
          border-radius: 0.5rem;
          padding: 1.5rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .business-meta-item {
          display: flex;
          justify-content: space-between;
          padding: 0.75rem 0;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .business-meta-item:last-child {
          border-bottom: none;
        }
        
        .business-meta-item .label {
          font-weight: 600;
          color: #4b5563;
        }
        
        .business-meta-item .value {
          color: #000;
        }
        
        /* Location section */
        .location-section {
          background-color: white;
          border-radius: 0.5rem;
          padding: 1.5rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .location-section h2 {
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 0.75rem;
          margin-bottom: 1rem;
          color: #2d3748;
        }
        
        .map-container {
          height: 300px;
          border-radius: 0.5rem;
          overflow: hidden;
          margin-bottom: 1rem;
        }
        
        .map-link {
          display: flex;
          align-items: center;
          color: #009688;
          margin-top: 0.5rem;
        }
        
        .map-link i {
          margin-right: 0.5rem;
        }
        
        /* Hours table */
        .hours-table {
          width: 100%;
        }
        
        .hours-table td {
          padding: 0.5rem 0;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .hours-table tr:last-child td {
          border-bottom: none;
        }
        
        .hours-table .day {
          font-weight: 600;
          width: 40%;
          color: #4b5563;
        }
        
        /* CTA button */
        .cta-button {
          display: inline-block;
          background-color: #009688;
          color: white;
          padding: 0.75rem 1.5rem;
          border-radius: 0.25rem;
          text-decoration: none;
          font-weight: 600;
          margin-top: 1rem;
          transition: background-color 0.3s;
        }
        
        .cta-button:hover {
          background-color: #00796b;
          color: white;
          text-decoration: none;
        }
        
        /* Star rating */
        .star-rating {
          color: #ffc107;
          display: flex;
          align-items: center;
        }
        
        .star-rating .count {
          margin-left: 0.5rem;
          color: #4a4a4a;
        }
      </style>
      
      <div class="company-banner">
        <div class="container">
          <h1>${salon.title}</h1>
          
          ${salon.city_name || salon.state_name ? `
          <div class="location">
            <i class="fas fa-map-marker-alt"></i>
            <span>${salon.city_name || ''} ${salon.state_name ? (salon.city_name ? ', ' : '') + salon.state_name : ''}</span>
          </div>
          ` : ''}
        </div>
      </div>
      
      <div class="container">
        <div class="content-grid">
          <div class="content-main">
            <div class="contact-info">
              ${salon.address ? `
              <div class="contact-info-item">
                <i class="fas fa-map-marker-alt"></i>
                <div>
                  ${salon.address}${salon.postal_code ? `, ${salon.postal_code}` : ''}
                </div>
              </div>
              ` : ''}
              
              ${salon.telephone ? `
              <div class="contact-info-item">
                <i class="fas fa-phone-alt"></i>
                <a href="tel:${salon.telephone}">${formattedPhone}</a>
              </div>
              ` : ''}
              
              ${salon.email ? `
              <div class="contact-info-item">
                <i class="fas fa-envelope"></i>
                <a href="mailto:${salon.email}">${salon.email}</a>
              </div>
              ` : ''}
              
              ${salon.website ? `
              <div class="contact-info-item">
                <i class="fas fa-globe"></i>
                <a href="${salon.website}" target="_blank" rel="noopener">${salon.website.replace(/^https?:\/\/(www\.)?/, '')}</a>
              </div>
              ` : ''}
              
              ${salon.opening_hours ? `
              <div class="contact-info-item">
                <i class="fas fa-clock"></i>
                <div>
                  <div>${salon.opening_hours.replace(/"/g, '').replace(/,/g, ', ')}</div>
                </div>
              </div>
              ` : ''}
            </div>
            
            <div class="business-details">
              <h2>About ${salon.title}</h2>
              <p>${salon.description || 'Professional electrolysis services for permanent hair removal.'}</p>
            </div>
            
            ${salon.service_product ? `
            <div class="business-details">
              <h2>Services Offered</h2>
              <ul class="services-list">
                ${servicesHtml}
              </ul>
            </div>
            ` : ''}
            
            ${hasCoordinates ? `
            <div class="location-section">
              <h2>Location</h2>
              <div id="map" class="map-container"></div>
              <div class="location-address">
                <i class="fas fa-map-marker-alt" style="color: #009688;"></i>
                ${salon.address}${salon.postal_code ? `, ${salon.postal_code}` : ''}
              </div>
              <a 
                href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salon.address || '')}" 
                target="_blank" 
                rel="noopener noreferrer"
                class="map-link"
              >
                <i class="fas fa-directions"></i>
                Get Directions
              </a>
            </div>
            ` : ''}
          </div>
          
          <div class="sidebar">
            <div class="business-meta">
              <h3 style="margin-bottom: 1rem; color: #2d3748;">Business Details</h3>
              
              ${salon.reviews && salon.average_star ? `
              <div class="business-meta-item">
                <div class="label">Rating</div>
                <div class="value star-rating">
                  ${ratingHtml}
                  <span class="count">(${salon.reviews} reviews)</span>
                </div>
              </div>
              ` : ''}
              
              ${salon.city_name ? `
              <div class="business-meta-item">
                <div class="label">Service Area</div>
                <div class="value">${salon.city_name} area</div>
              </div>
              ` : ''}
              
              ${salonCategories.length > 0 ? `
              <div class="business-meta-item">
                <div class="label">Categories</div>
                <div class="value">
                  ${salonCategories.slice(0, 3).join(', ')}
                  ${salonCategories.length > 3 ? `+ ${salonCategories.length - 3} more` : ''}
                </div>
              </div>
              ` : ''}
              
              ${salon.opening_hours ? `
              <div class="business-meta-item" style="display: block;">
                <div class="label" style="margin-bottom: 0.5rem;">Business Hours</div>
                <div class="value">
                  ${formattedHours}
                </div>
              </div>
              ` : ''}
            </div>
            
            <div style="text-align: center; margin-top: 1.5rem;">
              ${salon.telephone ? `
              <a href="tel:${salon.telephone}" class="cta-button" style="display: block; margin-bottom: 1rem;">
                <i class="fas fa-phone-alt mr-2"></i> Call Now
              </a>
              ` : ''}
              
              ${salon.website ? `
              <a href="${salon.website}" target="_blank" rel="noopener" class="cta-button" style="display: block;">
                <i class="fas fa-globe mr-2"></i> Visit Website
              </a>
              ` : ''}
            </div>
          </div>
        </div>
      </div>`;
      
      html += generateHTMLFooter(
        hasCoordinates, 
        salon.latitude, 
        salon.longitude, 
        salon.title
      );
      
      // Create directory structure and save file
      const salonDir = path.join(outputDir, 'companies', salon.slug);
      await fs.ensureDir(salonDir);
      await fs.writeFile(path.join(salonDir, 'index.html'), html);
      
      generatedCompanyPages++;
      if (generatedCompanyPages % 100 === 0) {
        console.log(`Generated ${generatedCompanyPages} company pages...`);
      }
    }
    
    console.log(`Generated ${generatedCompanyPages} company pages.`);
    
    // Generate HTML for city pages
    let generatedCityPages = 0;
    for (const city of processedCities) {
      // Get salons for this city
      const citySalons = processedSalons.filter(salon => {
        return salon.city_id === city.id || 
              (salon.city_name && salon.city_name.toLowerCase() === city.city.toLowerCase());
      });
      
      // Generate city page HTML
      let html = generateHTMLHeader(
        `${city.city}, ${city.state_name || ''}`,
        `Find electrolysis and permanent hair removal services in ${city.city}, ${city.state_name || ''}.`
      );
      
      html += `
        <div class="container">
          <div class="location-header">
            <h1>Electrolysis in ${city.city}, ${city.state_name || ''}</h1>
            <p>Find professional electrolysis providers in ${city.city}. Browse our directory of permanent hair removal specialists.</p>
          </div>
          
          <div class="location-content">
            <div class="location-providers">
              <h2>${citySalons.length} Electrolysis Providers in ${city.city}</h2>
              
              ${citySalons.length > 0 ? `
              <div class="provider-list">
                ${citySalons.map(salon => `
                <div class="provider-card">
                  <h3><a href="/companies/${salon.slug}/">${salon.title}</a></h3>
                  <p>${salon.address || ''}</p>
                  ${salon.telephone ? `<p><strong>Phone:</strong> <a href="tel:${salon.telephone}">${formatPhoneNumber(salon.telephone)}</a></p>` : ''}
                  <p>${salon.description ? salon.description.substring(0, 150) + (salon.description.length > 150 ? '...' : '') : 'Professional electrolysis services for permanent hair removal.'}</p>
                  <a href="/companies/${salon.slug}/" class="view-details">View Details</a>
                </div>
                `).join('')}
              </div>
              ` : `
              <div class="no-providers">
                <p>We currently don't have any electrolysis providers listed in ${city.city}. Are you a provider in this area? <a href="/add-listing/">Add your business</a> to our directory.</p>
              </div>
              `}
            </div>
            
            <div class="location-sidebar">
              <div class="sidebar-section">
                <h3>About ${city.city}</h3>
                <p>${city.city} is located in ${city.state_name || ''}. Browse our directory to find electrolysis providers in this area.</p>
              </div>
              
              <div class="sidebar-section">
                <h3>Nearby Cities</h3>
                <ul>
                  ${processedCities
                    .filter(c => c.state_id === city.state_id && c.id !== city.id)
                    .slice(0, 5)
                    .map(c => `<li><a href="/cities/${c.slug}/">${c.city}</a></li>`)
                    .join('')}
                </ul>
              </div>
            </div>
          </div>
        </div>
      `;
      
      html += generateHTMLFooter();
      
      // Create directory structure and save file
      const cityDir = path.join(outputDir, 'cities', city.slug);
      await fs.ensureDir(cityDir);
      await fs.writeFile(path.join(cityDir, 'index.html'), html);
      
      generatedCityPages++;
      if (generatedCityPages % 100 === 0) {
        console.log(`Generated ${generatedCityPages} city pages...`);
      }
    }
    
    console.log(`Generated ${generatedCityPages} city pages.`);
    
    // Generate HTML for state pages
    let generatedStatePages = 0;
    for (const state of processedStates) {
      // Get cities for this state
      const stateCities = processedCities.filter(city => city.state_id === state.id);
      
      // Get salons for this state
      const stateSalons = processedSalons.filter(salon => {
        return salon.state_id === state.id || 
              (salon.state_name && salon.state_name.toLowerCase() === state.state.toLowerCase()) ||
              (salon.city_id && stateCities.some(city => city.id === salon.city_id));
      });
      
      // Generate state page HTML
      let html = generateHTMLHeader(
        `${state.state}`,
        `Find electrolysis and permanent hair removal services in ${state.state}.`
      );
      
      html += `
        <div class="container">
          <div class="location-header">
            <h1>Electrolysis in ${state.state}</h1>
            <p>Find professional electrolysis providers in ${state.state}. Browse our directory of ${stateSalons.length} permanent hair removal specialists across ${stateCities.length} cities.</p>
          </div>
          
          <div class="location-content">
            <div class="state-cities">
              <h2>Cities in ${state.state}</h2>
              
              <div class="city-grid">
                ${stateCities.map(city => {
                  // Count salons in this city
                  const citySlug = slugify(city.city, { lower: true });
                  const citySalonsCount = processedSalons.filter(salon => 
                    salon.city_id === city.id || 
                    (salon.city_name && salon.city_name.toLowerCase() === city.city.toLowerCase())
                  ).length;
                  
                  return `
                  <div class="city-card">
                    <h3><a href="/cities/${city.slug}/">${city.city}</a></h3>
                    <p>${citySalonsCount} providers</p>
                  </div>
                  `;
                }).join('')}
              </div>
            </div>
            
            <div class="featured-providers">
              <h2>Featured Providers in ${state.state}</h2>
              
              ${stateSalons.length > 0 ? `
              <div class="provider-list featured">
                ${stateSalons.slice(0, 5).map(salon => `
                <div class="provider-card featured">
                  <h3><a href="/companies/${salon.slug}/">${salon.title}</a></h3>
                  <p>${salon.city_name || ''}, ${state.state}</p>
                  ${salon.telephone ? `<p><strong>Phone:</strong> <a href="tel:${salon.telephone}">${formatPhoneNumber(salon.telephone)}</a></p>` : ''}
                  <a href="/companies/${salon.slug}/" class="view-details">View Details</a>
                </div>
                `).join('')}
              </div>
              
              ${stateSalons.length > 5 ? `
              <div class="view-all">
                <p>Showing 5 of ${stateSalons.length} providers in ${state.state}.</p>
              </div>
              ` : ''}
              ` : `
              <div class="no-providers">
                <p>We currently don't have any electrolysis providers listed in ${state.state}. Are you a provider in this area? <a href="/add-listing/">Add your business</a> to our directory.</p>
              </div>
              `}
            </div>
            
            <div class="state-info">
              <h2>About Electrolysis in ${state.state}</h2>
              <p>Electrolysis is the only FDA-approved method for permanent hair removal. Our directory helps you find qualified electrolysis providers in ${state.state} who can help you achieve permanent freedom from unwanted hair.</p>
              <p>Choose from ${stateSalons.length} providers across ${stateCities.length} cities in ${state.state}.</p>
            </div>
          </div>
        </div>
      `;
      
      html += generateHTMLFooter();
      
      // Create directory structure and save file
      const stateDir = path.join(outputDir, 'states', state.slug);
      await fs.ensureDir(stateDir);
      await fs.writeFile(path.join(stateDir, 'index.html'), html);
      
      generatedStatePages++;
    }
    
    console.log(`Generated ${generatedStatePages} state pages.`);
    
    // Generate sitemap files
    generateSitemaps(processedSalons, processedCities, processedStates, processedCategories, outputDir);
    
    console.log('HTML generation completed successfully!');
  } catch (error) {
    console.error('Error generating HTML:', error);
    process.exit(1);
  }
}

function generateSitemaps(
  salons: any[], 
  cities: any[], 
  states: any[], 
  categories: any[],
  outputDir: string
) {
  // Logic for generating sitemaps would go here
  console.log('Generating sitemaps...');
  
  // Create company sitemaps (split if more than 200 entries)
  const baseUrl = 'https://electrolysisdirectory.com';
  const sitemapsDir = path.join(outputDir, 'sitemaps');
  fs.ensureDirSync(sitemapsDir);
  
  // Ensure the sitemap directory exists
  const sitemapDir = path.join(outputDir, 'sitemap');
  fs.ensureDirSync(sitemapDir);
  
  // Company sitemaps
  const companySitemaps: string[] = [];
  for (let i = 0; i < salons.length; i += 200) {
    const chunk = salons.slice(i, i + 200);
    const sitemapIndex = Math.floor(i / 200) + 1;
    
    let sitemapXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    sitemapXml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    for (const salon of chunk) {
      sitemapXml += '  <url>\n';
      sitemapXml += `    <loc>${baseUrl}/companies/${salon.slug}/</loc>\n`;
      sitemapXml += '    <changefreq>monthly</changefreq>\n';
      sitemapXml += '    <priority>0.8</priority>\n';
      sitemapXml += '  </url>\n';
    }
    
    sitemapXml += '</urlset>';
    
    const filename = `companies-sitemap${sitemapIndex}.xml`;
    fs.writeFileSync(path.join(sitemapsDir, filename), sitemapXml);
    companySitemaps.push(filename);
  }
  
  // City sitemap
  let citySitemapXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  citySitemapXml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  for (const city of cities) {
    citySitemapXml += '  <url>\n';
    citySitemapXml += `    <loc>${baseUrl}/cities/${city.slug}/</loc>\n`;
    citySitemapXml += '    <changefreq>weekly</changefreq>\n';
    citySitemapXml += '    <priority>0.7</priority>\n';
    citySitemapXml += '  </url>\n';
  }
  
  citySitemapXml += '</urlset>';
  fs.writeFileSync(path.join(sitemapsDir, 'cities-sitemap.xml'), citySitemapXml);
  
  // State sitemap
  let stateSitemapXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  stateSitemapXml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  for (const state of states) {
    stateSitemapXml += '  <url>\n';
    stateSitemapXml += `    <loc>${baseUrl}/states/${state.slug}/</loc>\n`;
    stateSitemapXml += '    <changefreq>weekly</changefreq>\n';
    stateSitemapXml += '    <priority>0.7</priority>\n';
    stateSitemapXml += '  </url>\n';
  }
  
  stateSitemapXml += '</urlset>';
  fs.writeFileSync(path.join(sitemapsDir, 'states-sitemap.xml'), stateSitemapXml);
  
  // Sitemap index
  let sitemapIndexXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  sitemapIndexXml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  // Add company sitemaps
  for (const sitemap of companySitemaps) {
    sitemapIndexXml += '  <sitemap>\n';
    sitemapIndexXml += `    <loc>${baseUrl}/sitemaps/${sitemap}</loc>\n`;
    sitemapIndexXml += `    <lastmod>${new Date().toISOString()}</lastmod>\n`;
    sitemapIndexXml += '  </sitemap>\n';
  }
  
  // Add other sitemaps
  sitemapIndexXml += '  <sitemap>\n';
  sitemapIndexXml += `    <loc>${baseUrl}/sitemaps/cities-sitemap.xml</loc>\n`;
  sitemapIndexXml += `    <lastmod>${new Date().toISOString()}</lastmod>\n`;
  sitemapIndexXml += '  </sitemap>\n';
  
  sitemapIndexXml += '  <sitemap>\n';
  sitemapIndexXml += `    <loc>${baseUrl}/sitemaps/states-sitemap.xml</loc>\n`;
  sitemapIndexXml += `    <lastmod>${new Date().toISOString()}</lastmod>\n`;
  sitemapIndexXml += '  </sitemap>\n';
  
  sitemapIndexXml += '</sitemapindex>';
  fs.writeFileSync(path.join(outputDir, 'sitemap.xml'), sitemapIndexXml);
  
  // Create an HTML sitemap
  let htmlSitemap = generateHTMLHeader('Sitemap', 'Complete sitemap of electrolysis providers, cities, and states');
  htmlSitemap += `
    <div class="container">
      <h1>Sitemap</h1>
      
      <div class="sitemap-section">
        <h2>States</h2>
        <ul class="sitemap-list">
          ${states.map(state => `<li><a href="/states/${state.slug}/">${state.state}</a></li>`).join('\n          ')}
        </ul>
      </div>
      
      <div class="sitemap-section">
        <h2>Cities</h2>
        <ul class="sitemap-list">
          ${cities.slice(0, 100).map(city => `<li><a href="/cities/${city.slug}/">${city.city}, ${city.state_name}</a></li>`).join('\n          ')}
          ${cities.length > 100 ? `<li><a href="/sitemap/cities/">View all ${cities.length} cities</a></li>` : ''}
        </ul>
      </div>
      
      <div class="sitemap-section">
        <h2>Companies</h2>
        <p>Browse electrolysis providers by state or city, or view our <a href="/companies/">complete directory</a>.</p>
      </div>
    </div>
  `;
  htmlSitemap += generateHTMLFooter();
  
  fs.writeFileSync(path.join(sitemapDir, 'index.html'), htmlSitemap);
  
  console.log('Sitemaps generated successfully!');
}

// Run the generator
generateHTML();