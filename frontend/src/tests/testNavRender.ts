// Test script to verify NavigationExperience and its children imports and runtime logic
import React from 'react';
import { NavigationExperience } from '../components/navigation/NavigationExperience';
import { NavigationMapProvider } from '../components/navigation/NavigationMapProvider';
import { GoogleNavigationMap } from '../components/navigation/GoogleNavigationMap';
import { LeafletNavigationMap } from '../components/navigation/LeafletNavigationMap';
import { NavigationMap } from '../components/navigation/NavigationMap';

console.log('Testing Navigation components loading:');
console.log('NavigationExperience:', typeof NavigationExperience);
console.log('NavigationMapProvider:', typeof NavigationMapProvider);
console.log('GoogleNavigationMap:', typeof GoogleNavigationMap);
console.log('LeafletNavigationMap:', typeof LeafletNavigationMap);
console.log('NavigationMap:', typeof NavigationMap);

console.log('ALL NAVIGATION COMPONENTS LOADED SUCCESSFULLY!');
