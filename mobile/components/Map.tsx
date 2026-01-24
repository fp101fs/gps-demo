import { useEffect, useRef } from 'react';
import { View, Image, Text, TouchableOpacity, Animated } from 'react-native';
import MapView, { Marker, Polyline, Circle, PROVIDER_DEFAULT, MarkerAnimated } from 'react-native-maps';
import { AnimatedRegion } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { calculateDistance, formatDistance } from '../lib/LocationUtils';

export interface Point {
  lat: number;
  lng: number;
  timestamp: number;
}

export interface SafeZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_meters: number;
}

export interface FleetMember {
  id: string;
  lat: number;
  lng: number;
  avatarUrl?: string;
  localAvatar?: number;
  nickname?: string;
  isSos?: boolean;
  lastSeen?: string;
  battery_level?: number;
  battery_state?: string;
  isGhost?: boolean;
}

interface MapProps {
  currentPoint?: Point;
  points: Point[];
  isReplayMode?: boolean;
  avatarUrl?: string;
  nickname?: string;
  isSos?: boolean;
  fleetMembers?: FleetMember[];
  safeZones?: SafeZone[];
  theme?: 'light' | 'dark';
  onMemberSelect?: (member: FleetMember) => void;
  zoomTarget?: { lat: number; lng: number } | null;
}

export default function Map({ currentPoint, points, isReplayMode, avatarUrl, nickname, isSos, fleetMembers = [], safeZones = [], onMemberSelect, zoomTarget }: MapProps) {
  const mapRef = useRef<MapView>(null);

  // Track animated regions for smooth marker transitions
  const animatedRegions = useRef<Map<string, AnimatedRegion>>(new Map());
  const markerRefs = useRef<Map<string, any>>(new Map());

  const getRelativeTime = (isoString?: string) => {
      if (!isoString) return '';
      const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (seconds < 60) return 'Just now';
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m ago`;
  };

  const recenter = () => {
      if (!mapRef.current) return;
      if (currentPoint) {
          mapRef.current.animateToRegion({
              latitude: currentPoint.lat,
              longitude: currentPoint.lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
          }, 1000);
      } else if (fleetMembers.length > 0) {
          mapRef.current.fitToCoordinates(
              fleetMembers.map(m => ({ latitude: m.lat, longitude: m.lng })),
              { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
          );
      }
  };

  useEffect(() => {
    // Initial Fit
    if (!currentPoint && fleetMembers.length > 0 && mapRef.current) {
         mapRef.current.fitToCoordinates(
             fleetMembers.map(m => ({ latitude: m.lat, longitude: m.lng })),
             { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
         );
    }
    
    if (currentPoint && !isReplayMode && mapRef.current) {
      if (currentPoint.lat !== 0 && currentPoint.lng !== 0) {
        mapRef.current.animateToRegion({
          latitude: currentPoint.lat,
          longitude: currentPoint.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 1000);
      }
    }
  }, [currentPoint, isReplayMode, fleetMembers]);

  // Handle zoom to specific target
  useEffect(() => {
    if (!mapRef.current || !zoomTarget) return;
    mapRef.current.animateToRegion({
      latitude: zoomTarget.lat,
      longitude: zoomTarget.lng,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 500);
  }, [zoomTarget]);

  // Animate fleet member markers smoothly when positions change
  useEffect(() => {
    fleetMembers.forEach(member => {
      let animatedRegion = animatedRegions.current.get(member.id);

      if (!animatedRegion) {
        // First time seeing this member - create animated region at current position
        animatedRegion = new AnimatedRegion({
          latitude: member.lat,
          longitude: member.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
        animatedRegions.current.set(member.id, animatedRegion);
      } else {
        // Animate to new position over 500ms
        animatedRegion.timing({
          latitude: member.lat,
          longitude: member.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
          duration: 500,
          useNativeDriver: false,
        }).start();
      }
    });

    // Cleanup: remove animated regions for members that left
    const currentIds = new Set(fleetMembers.map(m => m.id));
    animatedRegions.current.forEach((_, id) => {
      if (!currentIds.has(id)) {
        animatedRegions.current.delete(id);
        markerRefs.current.delete(id);
      }
    });
  }, [fleetMembers]);

  // Helper to get or create animated region for a member
  const getAnimatedRegion = (member: FleetMember): AnimatedRegion => {
    let region = animatedRegions.current.get(member.id);
    if (!region) {
      region = new AnimatedRegion({
        latitude: member.lat,
        longitude: member.lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });
      animatedRegions.current.set(member.id, region);
    }
    return region;
  };

  return (
    <View className="h-full w-full rounded-xl overflow-hidden border border-gray-200 relative">
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
        {safeZones.map(zone => (
            <Circle
                key={zone.id}
                center={{ latitude: zone.lat, longitude: zone.lng }}
                radius={zone.radius_meters}
                fillColor="rgba(59, 130, 246, 0.15)"
                strokeColor="#3b82f6"
                strokeWidth={2}
            />
        ))}

        {points.length > 1 && (
            <Polyline
                coordinates={points.map(p => ({ latitude: p.lat, longitude: p.lng }))}
                strokeColor="#2563eb"
                strokeWidth={4}
            />
        )}
        
        {fleetMembers.map(member => (
            <MarkerAnimated
                key={member.id}
                ref={(ref) => { if (ref) markerRefs.current.set(member.id, ref); }}
                coordinate={getAnimatedRegion(member)}
                title={member.nickname || 'Family Member'}
                onPress={() => onMemberSelect?.(member)}
                opacity={member.isGhost ? 0.6 : 1}
            >
                <View style={{ alignItems: 'center' }}>
                    {member.nickname && (
                        <View style={{ backgroundColor: member.isSos ? '#ef4444' : 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginBottom: 2 }}>
                            <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{member.nickname}</Text>
                        </View>
                    )}
                    {member.localAvatar ? (
                        <View style={{
                            width: member.isSos ? 60 : 40,
                            height: member.isSos ? 60 : 40,
                            borderRadius: member.isSos ? 30 : 20,
                            borderWidth: member.isSos ? 4 : 2,
                            borderColor: member.isSos ? '#ef4444' : 'white',
                            overflow: 'hidden',
                            backgroundColor: 'white',
                            opacity: (member.lastSeen && (Date.now() - new Date(member.lastSeen).getTime() > 300000)) ? 0.4 : 1
                        }}>
                            <Image source={member.localAvatar} style={{ width: '100%', height: '100%' }} />
                        </View>
                    ) : member.avatarUrl ? (
                        <View style={{
                            width: member.isSos ? 60 : 40,
                            height: member.isSos ? 60 : 40,
                            borderRadius: member.isSos ? 30 : 20,
                            borderWidth: member.isSos ? 4 : 2,
                            borderColor: member.isSos ? '#ef4444' : 'white',
                            overflow: 'hidden',
                            backgroundColor: 'white',
                            opacity: (member.lastSeen && (Date.now() - new Date(member.lastSeen).getTime() > 300000)) ? 0.4 : 1
                        }}>
                            <Image source={{ uri: member.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                        </View>
                    ) : (
                        <Image source={require('../assets/images/marker-green-cross.png')} style={{ width: member.isSos ? 60 : 40, height: member.isSos ? 60 : 40 }} resizeMode="contain" />
                    )}
                    {member.lastSeen && (Date.now() - new Date(member.lastSeen).getTime() > 60000) && (
                        <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 2, fontWeight: 'bold' }}>{getRelativeTime(member.lastSeen)}</Text>
                    )}
                    {currentPoint && (
                        <View style={{ backgroundColor: 'rgba(37, 99, 235, 0.8)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, marginTop: 2 }}>
                            <Text style={{ color: 'white', fontSize: 9, fontWeight: 'bold' }}>
                                {formatDistance(calculateDistance(currentPoint, member))}
                            </Text>
                        </View>
                    )}
                    {member.battery_level !== undefined && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, marginTop: 1 }}>
                            <Ionicons 
                                name={member.battery_state === 'charging' ? 'battery-charging' : (member.battery_level < 20 ? 'battery-dead' : 'battery-full')} 
                                size={10} 
                                color={member.battery_level < 20 ? '#ef4444' : '#22c55e'} 
                            />
                            <Text style={{ color: 'white', fontSize: 8, fontWeight: 'bold', marginLeft: 2 }}>{member.battery_level}%</Text>
                        </View>
                    )}
                </View>
            </MarkerAnimated>
        ))}

        {currentPoint && (
            <Marker 
                coordinate={{ latitude: currentPoint.lat, longitude: currentPoint.lng }}
                title={nickname || 'Me'}
            >
                <View style={{ alignItems: 'center' }}>
                    {nickname && (
                        <View style={{ backgroundColor: isSos ? '#ef4444' : 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginBottom: 2 }}>
                            <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{nickname}</Text>
                        </View>
                    )}
                    {avatarUrl ? (
                        <View style={{ 
                            width: isSos ? 60 : 40, 
                            height: isSos ? 60 : 40, 
                            borderRadius: isSos ? 30 : 20, 
                            borderWidth: isSos ? 4 : 2, 
                            borderColor: isSos ? '#ef4444' : 'white', 
                            overflow: 'hidden',
                            backgroundColor: 'white'
                        }}>
                            <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
                        </View>
                    ) : (
                        <Image source={require('../assets/images/marker-green-cross.png')} style={{ width: isSos ? 60 : 40, height: isSos ? 60 : 40 }} resizeMode="contain" />
                    )}
                </View>
            </Marker>
        )}
      </MapView>

      <TouchableOpacity 
        onPress={recenter}
        activeOpacity={0.7}
        className="absolute bottom-4 right-4 bg-white dark:bg-gray-900 p-3 rounded-full shadow-lg border border-gray-200 dark:border-gray-700"
      >
        <Ionicons name="locate" size={24} color="#2563eb" />
      </TouchableOpacity>
    </View>
  );
}
