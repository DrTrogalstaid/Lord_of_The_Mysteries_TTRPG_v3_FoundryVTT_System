/*------------------*/
/* Actor Models     */
/*------------------*/
class ActorData extends foundry.abstract.TypeDataModel {
    static defineSchema(){
        return {
            resources: new SchemaField({
                health: new SchemaField({
                    value: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
                    max: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
                }),
                spirit: new SchemaField({
                    value: new NumberField({ required: true, integer: true, min: 0, initial: 10}),
                    max: new NumberField({ required: true, integer: true, min: 0, initial: 10})
                }),
                rationality: new SchemaField({
                    value: new NumberField({ required: true, integer: true, min: 0, initial: 10}),
                    max: new NumberField({ required: true, integer: true, min: 0, initial: 10})
                }),
                luck: new SchemaField({
                    value: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    max: new NumberField({ required: true, integer: true, min: 0, initial: 0})
                }),
                spirituality: new SchemaField({
                    value: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    max: new NumberField({ required: true, integer: true, min: 0, initial: 0})
                })
            }),
            attributes: new SchemaField({
                strength: new SchemaField({
                    base: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    beyonder_bonus: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    corruption: new NumberField({ required: true, integer: true, min: 0, initial: 0})
                }),
                agility: new SchemaField({
                    base: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    beyonder_bonus: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    corruption: new NumberField({ required: true, integer: true, min: 0, initial: 0})
                }),
                willpower: new SchemaField({
                    base: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    beyonder_bonus: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    corruption: new NumberField({ required: true, integer: true, min: 0, initial: 0})
                }),
                physique: new SchemaField({
                    base: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    beyonder_bonus: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    corruption: new NumberField({ required: true, integer: true, min: 0, initial: 0})
                }),
                charisma: new SchemaField({
                    base: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    beyonder_bonus: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    corruption: new NumberField({ required: true, integer: true, min: 0, initial: 0})
                }),
                inspiration: new SchemaField({
                    base: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    beyonder_bonus: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    corruption: new NumberField({ required: true, integer: true, min: 0, initial: 0})
                }),
                luck: new SchemaField({
                    base: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    beyonder_bonus: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    corruption: new NumberField({ required: true, integer: true, min: 0, initial: 0})
                }),
                education: new SchemaField({
                    base: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    beyonder_bonus: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                    corruption: new NumberField({ required: true, integer: true, min: 0, initial: 0})
                }),
            }),
            armor: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
            dodge: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
            damage_resistance: new ArrayField({ 
                resistance: ObjectField({
                    fields: {
                        //TODO: Is this it's own object type in foundry??
                        damage_type: new StringField({ required: true}),
                        value : new NumberField({required: true, integer: true, min: 0})
                    }
                })
            }),
            languages: new ArrayField({
                //TODO: Make languages their own object? {Language(string), Mystical(bool)}
                language: new StringField({ required: true})
            })
        };
    }
}

// This is separate from ActorData, because not all actors will have sequence data
class SequenceData extends foundry.abstract.TypeDataModel{
    static defineSchema(){
        return {
            // TODO: Make this it's own object?? Similar to "Class" in other systems
            pathway: new ObjectField({
                common_name: new StringField({ required: true}),
                other_names: new ArrayField({
                    name: new StringField({ required: true})
                }),
                tarrot_association: new StringField({ required: true})
            }),
            current_sequence: new ObjectField({
                title: new StringField({ required: true}),
                sequence_number: new NumberField({required: true, integer: true, min: 0})
                
            })
        };
    }
}


class PlayerCharacterData extends ActorData {
    static defineSchema(){
        return {
            ...super.defineSchema(),
            biography: new SchemaField({
                height: new StringField({ required: true}),
                Weight: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
                physical_description: new StringField({ required: true}),
                religion: new StringField({ required: true}),
                ideas_and_beliefs: new StringField({ required: true}),
                prized_possession: new StringField({ required: true}),
                favorite_things: new StringField({ required: true}),
                dislikes: new StringField({ required: true}),
                birth_date: new StringField({ required: true}),
                birth_place: new StringField({ required: true}),
                backstory: new StringField({ required: true})
            }),
            //TODO: Add defineSchema from SequenceData
            age: new NumberField({ required: true, integer: true, min: 0, initial: 0}),
            occupation: new StringField({ required: true}),
            race: new StringField({ required: true}),
            gender: new StringField({ required: true}),
        };
    }
}



/*------------------*/
/* Item Models      */
/*------------------*/

