import { useEffect, useRef } from 'react';
import { View, Image } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';

export interface Point {
  lat: number;
  lng: number;
  timestamp: number;
}

interface MapProps {
  currentPoint?: Point;
  points: Point[];
  isReplayMode?: boolean;
  avatarUrl?: string;
  fleetMembers?: { id: string; lat: number; lng: number; avatarUrl?: string }[];
}

export default function Map({ currentPoint, points, isReplayMode, avatarUrl, fleetMembers = [] }: MapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    // If we have fleet members but no current point, fit to fleet
    if (!currentPoint && fleetMembers.length > 0 && mapRef.current) {
         mapRef.current.fitToCoordinates(
             fleetMembers.map(m => ({ latitude: m.lat, longitude: m.lng })),
             { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
         );
    }
    
    if (currentPoint && !isReplayMode && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: currentPoint.lat,
        longitude: currentPoint.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  }, [currentPoint, isReplayMode]);

  return (
    <View className="h-full w-full rounded-xl overflow-hidden border border-gray-200">
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={{ width: '100%', height: '100%' }}
        initialRegion={{
          latitude: currentPoint?.lat || 37.78825,
          longitude: currentPoint?.lng || -122.4324,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
      >
        {points.length > 1 && (
            <Polyline
                coordinates={points.map(p => ({ latitude: p.lat, longitude: p.lng }))}
                strokeColor="#2563eb"
                strokeWidth={4}
            />
        )}
        
        {fleetMembers.map(member => (
            <Marker
                key={member.id}
                coordinate={{ latitude: member.lat, longitude: member.lng }}
                title="Fleet Member"
            >
                {member.avatarUrl ? (
                    <View style={{ 
                        width: 40, 
                        height: 40, 
                        borderRadius: 20, 
                        borderWidth: 2, 
                        borderColor: 'white', 
                        overflow: 'hidden',
                        backgroundColor: 'white'
                    }}>
                        <Image 
                            source={{ uri: member.avatarUrl }} 
                            style={{ width: '100%', height: '100%' }} 
                        />
                    </View>
                ) : (
                    <Image 
                        source={require('../assets/images/marker-green-cross.png')} 
                        style={{ width: 40, height: 40 }} 
                        resizeMode="contain"
                    />
                )}
            </Marker>
        ))}
        
        {currentPoint && (
            <Marker 
                coordinate={{ latitude: currentPoint.lat, longitude: currentPoint.lng }}
                title="Current Location"
            >
                {avatarUrl ? (
                    <View style={{ 
                        width: 40, 
                        height: 40, 
                        borderRadius: 20, 
                        borderWidth: 2, 
                        borderColor: 'white', 
                        overflow: 'hidden',
                        backgroundColor: 'white'
                    }}>
                        <Image 
                            source={{ uri: avatarUrl }} 
                            style={{ width: '100%', height: '100%' }} 
                        />
                    </View>
                ) : (
                    <Image 
                        source={require('../assets/images/marker-green-cross.png')} 
                        style={{ width: 40, height: 40 }} 
                        resizeMode="contain"
                    />
                )}
            </Marker>
        )}
      </MapView>
    </View>
  );
}