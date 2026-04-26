import React, { useState, useMemo } from 'react';
import {
  View,
  Modal,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from './Typography';
import { Search, X, MapPin } from 'lucide-react-native';
import { AIRPORTS, Airport } from '../data/airports';

interface AirportAutocompleteProps {
  label: string;
  value: string;
  onChange: (airportName: string) => void;
  placeholder?: string;
}

export const AirportAutocomplete: React.FC<AirportAutocompleteProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Search city or airport',
}) => {
  const [focus, setFocus] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const seen = new Set<string>();
    const matches: Airport[] = [];
    for (const a of AIRPORTS) {
      const matchCity = a.city.toLowerCase().includes(q);
      const matchCountry = a.country.toLowerCase().includes(q);
      const matchIata = a.iata.toLowerCase().includes(q);
      if ((matchCity || matchCountry || matchIata) && matches.length < 7) {
        const key = `${a.city}|${a.country}|${a.iata}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push(a);
        }
      }
    }
    return matches;
  }, [query]);

  const handleSelect = (airport: Airport) => {
    onChange(airport.city);
    setQuery(airport.city);
    setFocus(false);
    Keyboard.dismiss();
  };

  const handleChange = (text: string) => {
    setQuery(text);
    onChange(text);
  };

  const clear = () => {
    setQuery('');
    onChange('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <MapPin color={COLORS.primary} size={16} />
        <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={1}>
          {label}
        </Typography>
      </View>
      <View style={styles.inputWrapper}>
        <Search color={COLORS.background.slate[400]} size={18} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={COLORS.background.slate[400]}
          value={query || value}
          onChangeText={handleChange}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {(query || value) && (
          <TouchableOpacity onPress={clear} style={styles.clearBtn}>
            <X color={COLORS.background.slate[400]} size={16} />
          </TouchableOpacity>
        )}
      </View>

      {/* Dropdown suggestions */}
      {focus && filtered.length > 0 && (
        <View style={styles.dropdown}>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.iata}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={filtered.length > 5}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.item} onPress={() => handleSelect(item)}>
                <View style={styles.itemLeft}>
                  <Typography size="lg" weight="bold" style={styles.iata}>
                    {item.iata}
                  </Typography>
                  <View style={styles.itemMain}>
                    <Typography size="base" weight="medium" numberOfLines={1}>
                      {item.city}
                    </Typography>
                    <Typography size="xs" color={COLORS.background.slate[500]} numberOfLines={1}>
                      {item.country}
                    </Typography>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
    position: 'relative',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.background.slate[200],
    paddingHorizontal: SPACING.md,
    height: 56,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.background.slate[900],
  },
  clearBtn: {
    padding: 4,
  },
  dropdown: {
    position: 'absolute',
    top: 82,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.background.slate[200],
    shadowColor: COLORS.black,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
    maxHeight: 220,
    zIndex: 50,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background.slate[100],
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iata: {
    minWidth: 44,
    color: COLORS.primary,
  },
  itemMain: {
    flex: 1,
  },
});
