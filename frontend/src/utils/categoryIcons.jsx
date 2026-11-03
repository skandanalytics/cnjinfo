import React from 'react';
import { FiGrid, FiStar, FiPercent, FiHeart } from 'react-icons/fi';
import { FaBurger, FaPizzaSlice, FaBowlRice, FaUtensils, FaMugHot, FaIceCream } from 'react-icons/fa6';

export const getCategoryIcon = (category, size = 14) => {
  const norm = String(category || '').toLowerCase();
  if (norm === 'all') return <FiGrid size={size} />;
  if (norm === 'popular') return <FiStar size={size} />;
  if (norm.includes('discount') || norm.includes('offer')) return <FiPercent size={size} />;
  if (norm.includes('burger')) return <FaBurger size={size} />;
  if (norm.includes('pizza')) return <FaPizzaSlice size={size} />;
  if (norm.includes('biryani') || norm.includes('rice')) return <FaBowlRice size={size} />;
  if (norm.includes('indian') || norm.includes('meal') || norm.includes('thali') || norm.includes('combo') || norm.includes('breakfast')) return <FaUtensils size={size} />;
  if (norm.includes('starter') || norm.includes('snack') || norm.includes('appetizer') || norm.includes('fry') || norm.includes('fries') || norm.includes('roll')) return <FaUtensils size={size} />;
  if (norm.includes('dessert') || norm.includes('sweet') || norm.includes('cake') || norm.includes('ice cream') || norm.includes('pastry')) return <FaIceCream size={size} />;
  if (norm.includes('beverage') || norm.includes('drink') || norm.includes('coffee') || norm.includes('tea') || norm.includes('juice') || norm.includes('shake') || norm.includes('soda') || norm.includes('mocktail')) return <FaMugHot size={size} />;
  if (norm.includes('pasta') || norm.includes('noodle') || norm.includes('chinese') || norm.includes('asian') || norm.includes('momo')) return <FaBowlRice size={size} />;
  if (norm.includes('soup') || norm.includes('salad')) return <FiHeart size={size} />;
  return <FiGrid size={size} />;
};
