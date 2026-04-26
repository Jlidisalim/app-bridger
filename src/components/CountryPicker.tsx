import React, { useState, useMemo } from 'react';
import {
    View,
    Modal,
    FlatList,
    TouchableOpacity,
    TextInput,
    StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../theme/theme';
import { Typography } from './Typography';
import { Search, X } from 'lucide-react-native';
import { COUNTRIES, DEFAULT_COUNTRY } from '../data/countries';
import type { Country } from '../data/countries';

export { COUNTRIES, DEFAULT_COUNTRY, type Country };

interface CountryPickerProps {
    selectedCountry: Country;
    onSelect: (country: Country) => void;
}

export const CountryPicker: React.FC<CountryPickerProps> = ({
    selectedCountry,
    onSelect,
}) => {
    const [visible, setVisible] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return COUNTRIES;
        const q = search.toLowerCase();
        return COUNTRIES.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.dialCode.includes(q) ||
                c.code.toLowerCase().includes(q)
        );
    }, [search]);

    const handleSelect = (country: Country) => {
        onSelect(country);
        setVisible(false);
        setSearch('');
    };

    const renderItem = ({ item }: { item: Country }) => (
        <TouchableOpacity
            style={[
                styles.countryRow,
                item.code === selectedCountry.code && styles.countryRowSelected,
            ]}
            onPress={() => handleSelect(item)}
            activeOpacity={0.6}
        >
            <Typography size="xl" style={styles.flag}>{item.flag}</Typography>
            <View style={styles.countryInfo}>
                <Typography size="base" weight="medium" numberOfLines={1}>
                    {item.name}
                </Typography>
            </View>
            <Typography size="base" color={COLORS.background.slate[500]}>
                {item.dialCode}
            </Typography>
        </TouchableOpacity>
    );

    return (
        <>
            <TouchableOpacity
                style={styles.selector}
                onPress={() => setVisible(true)}
                activeOpacity={0.7}
            >
                <Typography size="xl">{selectedCountry.flag}</Typography>
                <Typography size="base" weight="medium" style={styles.dialCode}>
                    {selectedCountry.dialCode}
                </Typography>
                <Typography size="xs" color={COLORS.background.slate[400]}>
                    {'\u25BE'}
                </Typography>
            </TouchableOpacity>

            <Modal
                visible={visible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => {
                    setVisible(false);
                    setSearch('');
                }}
            >
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Typography size="lg" weight="bold">
                            Select Country
                        </Typography>
                        <TouchableOpacity
                            onPress={() => {
                                setVisible(false);
                                setSearch('');
                            }}
                            style={styles.closeButton}
                        >
                            <X color={COLORS.background.slate[600]} size={24} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.searchContainer}>
                        <Search
                            color={COLORS.background.slate[400]}
                            size={18}
                            style={styles.searchIcon}
                        />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search country or code..."
                            placeholderTextColor={COLORS.background.slate[400]}
                            value={search}
                            onChangeText={setSearch}
                            autoCorrect={false}
                            autoCapitalize="none"
                        />
                    </View>

                    <FlatList
                        data={filtered}
                        keyExtractor={(item) => item.code}
                        renderItem={renderItem}
                        contentContainerStyle={styles.listContent}
                        keyboardShouldPersistTaps="handled"
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Typography
                                    size="base"
                                    color={COLORS.background.slate[400]}
                                    align="center"
                                >
                                    No countries found
                                </Typography>
                            </View>
                        }
                    />
                </SafeAreaView>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    selector: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 56,
        paddingHorizontal: SPACING.md,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: `${COLORS.primary}33`,
        gap: SPACING.sm,
    },
    dialCode: {
        minWidth: 36,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: COLORS.background.light,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.lg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[200],
        backgroundColor: COLORS.white,
    },
    closeButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: SPACING.xl,
        marginVertical: SPACING.md,
        paddingHorizontal: SPACING.md,
        height: 48,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
    },
    searchIcon: {
        marginRight: SPACING.sm,
    },
    searchInput: {
        flex: 1,
        fontSize: TYPOGRAPHY.sizes.base,
        fontFamily: TYPOGRAPHY.fontFamily,
        color: COLORS.background.slate[900],
        height: '100%',
    },
    listContent: {
        paddingHorizontal: SPACING.xl,
        paddingBottom: SPACING.xl,
    },
    countryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.sm,
    },
    countryRowSelected: {
        backgroundColor: `${COLORS.primary}0D`,
    },
    flag: {
        marginRight: SPACING.md,
    },
    countryInfo: {
        flex: 1,
        marginRight: SPACING.sm,
    },
    emptyContainer: {
        paddingVertical: SPACING['3xl'],
        alignItems: 'center',
    },
});
