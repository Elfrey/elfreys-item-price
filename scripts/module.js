const MODULE_ID = 'elfreys-item-price';

let EIPModuleSetting = {};
EIPModuleSetting['ENABLED_PACKS'] = 'ENABLED_PACKS';
EIPModuleSetting['PRICE_GEN_METHOD'] = 'priceGenMethod';
EIPModuleSetting['ENABLE_SETTING'] = 'enableSetting';
EIPModuleSetting['GENERATE_FOR_IP_MERCHANT'] = 'generateForIPMerchant';
EIPModuleSetting['ITEM_PRICE_PACKS'] = 'itemPricePacks';

const translate = (string) => {
    return game.i18n.localize(string);
};

const setSetting = (setting, value) => {
    return game.settings.set(MODULE_ID, setting, value);
};
const getSetting = (key) => {
    return game.settings.get(MODULE_ID, key);
};

class PackSelect extends FormApplication {
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            title: '',
            id: 'packs-select',
            template: `modules/${MODULE_ID}/templates/packs-select.hbs`,
            resizable: true,
            width: 660,
        };
    }

    getData() {
        if (!game.packs) return null;
        const enabledPacks = getSetting(EIPModuleSetting.ENABLED_PACKS);
        const itemsPacks = game.packs.filter((pack) => {
            return pack.metadata.type === 'Item';
        });
        const returnPacks = itemsPacks.map((pack) => {
            return {
                label: pack.metadata.label,
                id: pack.metadata.id,
                enabled: enabledPacks.includes(pack.metadata.id),
            };
        });
        return {
            compendiums: [...returnPacks],
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        // Set initial state for all
        // const enabledPacks = getSetting(EIPModuleSetting.ENABLED_PACKS);
        // Regular check change -> updates root check
        html.find('.form-fields input').on('change', function () {
            const compendium = this.id;
            html.find(`[data-disable="${compendium}"]`).prop('checked', this.checked);
        });
        // Deselect all button
        html.find('button.deselect-all').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            html
                .find(`.form-group.pack input[type="checkbox"]`)
                .prop('checked', false);
        });
        // Select all button
        html.find('button.select-all').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            html
                .find(`.form-group.pack input[type="checkbox"]`)
                .prop('checked', true);
        });
    }

    async _updateObject(event, formData) {
        const enabledPacks = Object.keys(formData).filter(packId => formData[packId]);
        console.log('enabledPacks', enabledPacks);
        setSetting(EIPModuleSetting.ENABLED_PACKS, enabledPacks);
    }
}

const priceByXGE = {
    common: '(1d6+1) * 10',
    uncommon: '(1d6) * 100',
    rare: '2d10 * 1000',
    veryRare: '(1d4+1) * 10000',
    legendary: '2d6 * 25000',
    artifact: '2d6 * 250000',
};
const priceByDMG = {
    common: [50, 100],
    uncommon: [101, 500],
    rare: [501, 5000],
    veryRare: [5001, 50000],
    legendary: [50001, 2000000],
    artifact: [2000000, 100000000],
};

const consumableTypes = ['potion', 'ammo', 'scroll'];

function getRandomPriceByRange(min, max) {
    return Math.round(Math.random() * (max - min) + min);
}

Hooks.once('init', async () => {
    const priceGenMethod = ['DMG', 'XGE'];

    game.settings.registerMenu(MODULE_ID, EIPModuleSetting.ITEM_PRICE_PACKS, {
        menu: 'itemPricePacksMenu',
        name: translate('EIP.itemPricePacksName'),
        label: translate('EIP.itemPricePacksLabel'),
        hint: translate('EIP.itemPricePacksHint'),
        icon: 'fas fa-search',
        type: PackSelect,
        restricted: false,
    });
    game.settings.register(MODULE_ID, EIPModuleSetting.ENABLE_SETTING, {
        name: translate('EIP.moduleEnabledName'),
        hint: translate('EIP.moduleEnabledHint'),
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
    });
    game.settings.register(MODULE_ID, EIPModuleSetting.GENERATE_FOR_IP_MERCHANT, {
        name: translate('EIP.enableForIPMerchantName'),
        hint: translate('EIP.enableForIPMerchantHint'),
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
    });
    game.settings.register(MODULE_ID, EIPModuleSetting.PRICE_GEN_METHOD, {
        name: translate('EIP.priceGenMethodName'),
        hint: translate('EIP.priceGenMethodHint'),
        type: Number,
        default: 1,
        choices: priceGenMethod,
        scope: 'world',
        config: true,
        restricted: true,
    });

    game.settings.register(MODULE_ID, EIPModuleSetting.ENABLED_PACKS, {
        name: translate('EIP.disabledPackName'),
        type: Array,
        default: [],
        scope: 'world',
        config: false,
    });
});

const HALF_PRICE_MULTIPLIER = 0.5;

const getPrice = async (
    priceGenerationMethod,
    diceRollFormula,
    priceRange,
    consumableType = false
) => {
    const generatePrice = async () => {
        if (priceGenerationMethod === 1) {
            const rollPrice = new Roll(diceRollFormula);
            return (await rollPrice.evaluate({async: true})).total;
        }
        return getRandomPriceByRange(priceRange[0], priceRange[1]);
    };

    let price = await generatePrice();
    const isConsumable = consumableTypes.includes(consumableType);

    if (isConsumable) {
        price *= HALF_PRICE_MULTIPLIER;
        console.log('Half price for consumable');
    }

    return price;
};

Hooks.on('createItem', async (item) => {
    if (item._stats.compendiumSource) {
        const sourcePack = item._stats.compendiumSource.split('.').slice(1, -2).join('.');
        const isModuleEnabled = game.settings.get(MODULE_ID, EIPModuleSetting.ENABLE_SETTING);
        const isMerchantGeneratorEnabled = game.settings.get(MODULE_ID, EIPModuleSetting.GENERATE_FOR_IP_MERCHANT);
        if (!isModuleEnabled || item.system.price.value == null) return;

        const enabledPacks = getSetting(EIPModuleSetting.ENABLED_PACKS);


        let isFromEnabledPack = sourcePack && enabledPacks.includes(sourcePack);
        const actor = item.parent;

        const isMerchantItem = actor?.getFlag('item-piles', 'data.enabled') && actor?.getFlag("item-piles", "data.type") === "merchant" && isMerchantGeneratorEnabled;

        if (!isFromEnabledPack && !isMerchantItem) return;

        const priceGenMethod = game.settings.get(MODULE_ID, EIPModuleSetting.PRICE_GEN_METHOD);
        const priceByRarity = priceGenMethod === 1 ? priceByXGE : priceByDMG;


        updateItemPrice(item, priceGenMethod, priceByRarity);
    }
});

async function updateItemPrice(item, priceGenMethod, priceByRarity) {
    const rarity = foundry.utils.getProperty(item, 'system.rarity');
    if (!rarity || !priceByRarity[rarity]) {
        console.warning('No item rarity');
        return;
    }

    const isConsumable = foundry.utils.getProperty(item, 'type') === 'consumable';
    const priceRange = priceByRarity[rarity];
    const price = await getPrice(priceGenMethod, priceRange, [priceRange[0], priceRange[1]], isConsumable ? foundry.utils.getProperty(item, 'system.type.value') : false);

    item.update({
        system: {
            price: { value: price },
        },
    });
}
