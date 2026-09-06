export interface WeatherLocation {
  latitudeDegrees: number;
  longitudeDegrees: number;
  elevationMeters: number;
}

export interface WeatherForecastQuery {
  latitudeDegrees: number;
  longitudeDegrees: number;
  from: Date;
  to: Date;
}

export interface HourlyWeatherConditions {
  forecastAt: string;
  temperatureCelsius: number;
  relativeHumidityPercent: number;
  precipitationProbabilityPercent: number;
  precipitationMillimeters: number;
  cloudCoverPercent: number;
  visibilityMeters: number;
  windSpeedKilometersPerHour: number;
}

export interface WeatherForecast {
  location: WeatherLocation;
  timezone: 'UTC';
  fetchedAt: string;
  hourly: HourlyWeatherConditions[];
}

/**
 * Vendor-neutral port consumed by planning services.
 * Provider-specific payloads must not cross this boundary.
 */
export interface WeatherProvider {
  getForecast(query: WeatherForecastQuery): Promise<WeatherForecast>;
}
