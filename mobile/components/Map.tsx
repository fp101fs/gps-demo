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
}

export default function Map({ currentPoint, points, isReplayMode, avatarUrl }: MapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
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