import { StreamingService } from "./StreamingService";
import { SpotifyService } from "./SpotifyService";
import { AppleMusicService } from "./AppleMusicService";
import { StreamingServiceType } from "../utils/types";

/**
 * Factory to get the appropriate streaming service implementation
 */
export class ServiceFactory {
  private static instances: Map<StreamingServiceType, StreamingService> =
    new Map();

  static getService(serviceType: StreamingServiceType): StreamingService {
    // Return cached instance if available
    if (this.instances.has(serviceType)) {
      return this.instances.get(serviceType)!;
    }

    // Create new instance based on service type
    let service: StreamingService;

    switch (serviceType) {
      case "spotify":
        service = new SpotifyService();
        break;
      case "apple_music":
        service = new AppleMusicService();
        break;
      case "youtube_music":
        throw new Error("YouTube Music not yet implemented");
      default:
        throw new Error(`Unknown service type: ${serviceType}`);
    }

    // Cache the instance
    this.instances.set(serviceType, service);
    return service;
  }
}
