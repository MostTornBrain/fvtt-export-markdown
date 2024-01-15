import "./lib/jszip.min.js";
import { TurndownService } from "./lib/turndown.js";
import { TurndownPluginGfmService } from "./lib/turndown-plugin-gfm.js";
import "./lib/js-yaml.min.js";
import replaceAsync from "./lib/string-replace-async.js";
import * as MOD_CONFIG from "./config.js";
import { myRenderTemplate, clearTemplateCache } from "./render-template.js"

const MODULE_NAME = "export-markdown";
const FRONTMATTER = "---\n";
const EOL = "\n";
const MARKER = "```";

const destForImages = "zz_asset-files";

let zip;



const IMG_SIZE = "150";

let use_uuid_for_journal_folder=true;
let use_uuid_for_notename=true;

class DOCUMENT_ICON {
    // indexed by CONST.DOCUMENT_TYPES
    static table = {
        Actor: ":user:",
        Cards: ":spade:",
        ChatMessage: ":messages-square:",
        Combat: ":swords:",
        Item: ":luggage:",
        Folder: ":folder:",
        JournalEntry: ":book:",
        JournalEntryPage: ":sticky-note:",   // my own addition
        //Macro: "",
        Playlist: ":music:",
        RollTable: ":list:",
        Scene: ":map:"
    };

    //User: ""
    static lookup(document) {
        return DOCUMENT_ICON.table?.[document.documentName] || ":file-question:";
    }
}

/**
 * 
 * @param {Object} from Either a folder or a Journal, selected from the sidebar
 */

function validFilename(name) {
    const regexp = /[<>:"/\\|?*]/g;
    return name.replaceAll(regexp, '_');
}

function docfilename(doc) {
    return use_uuid_for_notename ? doc.uuid : validFilename(doc.name);
}

function zipfilename(doc) {
    return `${docfilename(doc)}.md`;
}

function formpath(dir,file) {
    return dir ? (dir + "/" + file) : file;
}

function templateFile(doc) {
    // Look for a specific template, otherwise use the generic template
    let base = (doc instanceof Actor) ? "Actor" : (doc instanceof Item) ? "Item" : undefined;
    if (!base) return undefined;
    return game.settings.get(MODULE_NAME, `template.${base}.${doc.type}`) || game.settings.get(MODULE_NAME, `template.${base}`);
}

/**
 * Export data content to be saved to a local file
 * @param {string} blob       The Blob of data
 * @param {string} filename   The filename of the resulting download
 */
function saveDataToFile(blob, filename) {
    // Create an element to trigger the download
    let a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = filename;

    // Dispatch a click event to the element
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return new Promise(resolve => setTimeout(() => { window.URL.revokeObjectURL(a.href); resolve()}, 100));
}

function folderpath(doc) {
    let result = "";
    let folder = doc.folder;
    while (folder) {
        const foldername = validFilename(folder.name);
        result = result ? formpath(foldername, result) : foldername;
        folder = folder.folder;
    }
    return result;
}

function formatLink(link, label=null, inline=false) {
    let body = link;
    if (label && label != link) body += `|${label}`;
    let result = `[[${body}]]`;
    if (inline) result = "!" + result;
    return result;
}

function fileconvert(filename, label_or_size=null, inline=true) {
    filename = decodeURIComponent(filename);
    //let basefilename = filename.slice(filename.lastIndexOf("/") + 1);
    // ensure same base filename in different paths are stored as different files,
    // whilst keeping the total length below the ZIP limit of 260 characters.
    let basefilename = filename.replaceAll("/","-").slice(-250 + destForImages.length); 

    zip.folder(destForImages).file(basefilename, 
        // Provide a Promise which JSZIP will wait for before saving the file.
        // (Note that a CORS request will fail at this point.)
        fetch(filename).then(resp => {
            if (resp.status !== 200) {
                console.error(`Failed to fetch file from '${filename}' (response ${resp.status})`)
                return new Blob();
            } else {
                console.debug(`Adding file ${basefilename}`);
                return resp.blob();
            }
        }).catch(e => { 
            console.log(e);
            return new Blob();
        }),
    {binary:true});

    return formatLink(basefilename, label_or_size, inline);
}

function replaceLinkedFile(str, filename) {
    // For use by String().replaceAll,
    // Ensure we DON'T set the third parameter from a markdown link
    // See if we can grab the file.
    //console.log(`fileconvert for '${filename}'`);
    if (filename.startsWith("data:image") || filename.startsWith(":")) {
        // e.g.
        // http://URL
        // https://URL
        // data:image;inline binary
        console.log(`Ignoring file/external URL in '${str}':\n${filename}`);
        return str;
    }
    return fileconvert(filename);
}

function notefilename(doc) {
    return docfilename((doc instanceof JournalEntryPage && doc.parent.pages.size === 1) ? doc.parent : doc);
}

let turndownService, gfm;

async function convertLinks(markdown, relativeTo) {

    // Needs to be nested so that we have access to 'relativeTo'
    async function replaceOneLink(str, type, target, hash, label, offset, string, groups) {

        // One of my Foundry Modules introduced adding "inline" to the start of type.
        let inline = type.startsWith("inline");
        if (inline) type = type.slice("inline".length);
        // Maybe handle `@PDF` links properly too

        function dummyLink() {
            // Make sure that "|" in the ID don't start the label early (e.g. @PDF[whatever|page=name]{label})
            return formatLink(target, label);
        }

        // Ignore link if it isn't one that we can parse.
        const documentTypes = new Set(CONST.DOCUMENT_LINK_TYPES.concat(["Compendium", "UUID"]));
        if (!documentTypes.has(type)) return str;
        
        // Ensure the target is in a UUID format.
        if (type !== "UUID") target = `${type}.${target}`

        let linkdoc;
        try {
            linkdoc = await fromUuid(target, {relative: relativeTo});
            if (!label && !hash) label = doc.name;
        } catch (error) {
            console.debug(`Unable to fetch label from Compendium for ${target}`, error)
            return dummyLink();
        }

        if (!linkdoc) return dummyLink();
        
        // A journal with only one page is put into a Note using the name of the Journal, not the only Page.
        let filename = notefilename(linkdoc);
    
        // FOUNDRY uses slugified section names, rather than the actual text of the HTML header.
        // So we need to look up the slug in the Journal Page's TOC.
        let result = filename;
        if (hash && linkdoc instanceof JournalEntryPage) {
            const toc = linkdoc.toc;
            if (toc[hash]) {
                result += `#${toc[hash].text}`;
                if (!label) label = toc[hash].text;
            }
        }
        return formatLink(result, label, /*inline*/false);  // TODO: maybe pass inline if we really want inline inclusion
    }
    
    // Convert all the links
    const pattern = /@([A-Za-z]+)\[([^#\]]+)(?:#([^\]]+))?](?:{([^}]+)})?/g;
    markdown = await replaceAsync(markdown, pattern, replaceOneLink);
    
    // Replace file references (TBD AFTER HTML conversion)
    const filepattern = /!\[\]\(([^)]*)\)/g;
    markdown = markdown.replaceAll(filepattern, replaceLinkedFile);

    return markdown;
}

// Evaluate a math formula to turn it into a number.
// This is designed to resolve things that reference ceil() or floor()
// and an item or spell level, such as @Damage or @Template commands.
// *****************************************************************
// WARNING: THIS WILL EXECUTE ARBITRARY JAVASCRIPT TEXT CONTAINED IN 
//          THE MODULES BEING EXPORTED.  ENSURE YOU TRUST THE SOURCE
//          OF THE DATA YOU ARE EXPORTING!!!
// *****************************************************************
function doMath(doc, formula) {
    let level = doc.level;
    formula = formula.replaceAll("(@item.level)", level);
    formula = formula.replaceAll("@item.level", level);
    formula = formula.replaceAll("ceil", "Math.ceil");
    formula = formula.replaceAll("floor", "Math.floor");
    
    // Don't try to evaluate the formula if it is an actual dice roll
    if (formula.includes('d') || formula.includes('D')) {
        return formula;
    }
    
    try {
        let result = eval(formula);
        return result;
    } catch(error) {
        console.error("Error evaluating: ", formula, error);
    } 
    return "MATH_ERROR";
}

async function convertHtml(doc, html) {
    // Foundry uses "showdown" rather than "turndown":
    // SHOWDOWN fails to parse tables at all

    if (!turndownService) {
        // Setup Turndown service to use GFM for tables
        // headingStyle: "atx"  <-- use "###" to indicate heading (whereas setext uses === or --- to underline headings)
        turndownService = new TurndownService({ 
            headingStyle: "atx",
            codeBlockStyle: "fenced"
        });
        // GFM provides supports for strikethrough, tables, taskListItems, highlightedCodeBlock
        gfm = TurndownPluginGfmService.gfm;
        turndownService.use(gfm);
        
        // Add a custom rule for handling action-glyph spans.
        // Convert them to Obsidian PF2E Action Icons plugin format.
        turndownService.addRule('actionGlyph', {
          filter: function (node, options) {
            return (
              node.nodeName === 'SPAN' &&
              node.getAttribute('class') === 'action-glyph'
            );
          },
          replacement: function (content, node, options) {
            // Match the default format used by the PF2E Action Icons plugin
            switch (content) {
             // Free action
             case'F':
                content = '0';
                break;
                
             // Reaction
             case 'R':
                content = 'r';
                break;
                
             // Action - some Foundry entries use 1 (such as most spells), others use 'a'
             case 'a':
                content = '1';
                break;
            }
            
            return '`pf2:' + content + '`';
          }
        });

    }
    let markdown;
    try {
        // Convert Foundry roll commands to plain text
        // Format is [[/r (dice formula) description[sometext]]]{plain text}. 
        //     We just want to grab the {plain text}
        const roll2Pattern = /\[\[\/(?:[br]+)\s+(?:.*?)\]\]{(.*?)}/g;
        markdown = html.replace(roll2Pattern, function(match, p1) {
                                                    return `${p1}`;
                                              });

        // Convert another style Foundry roll commands to plain text
        // Format is [[/r (dice formula) description[sometext]]], 
        //     where the "description" and [sometext] is optional
        // The dice formula can contain a level reference as "@item.level".
        const rollPattern = /\[\[\/r\s+([^\[\]]+)(?:\]|\[\s*([^\[\]]*)\])*\]\]/g;
        markdown = markdown.replace(rollPattern, function(match, p1, p2) {
                                               let result = doMath(doc, p1);
                                               if (p2 && p2 != 'healing'){
                                                    return `${result} ${p2.replace(/,/g, ' ')}`;
                                                } else {
                                                    return result;
                                                }
                                              });

        // Convert @"Something" tags to plain text
        // Sample format: @Damage[(2d6+4)[bludgeoning]]{plain text}
        // Could be @Damage, @Template, @Check...
        // Just grab the plain text
        const genericPattern = /@(?:\w+)\[(?:.*?)\]{(.*?)}/g;
        markdown = markdown.replace(genericPattern, function(match, p1) {
                                                        if (match.includes('@UUID')) {
                                                            return match;
                                                        } else {
                                                            return `${p1}`;
                                                        }
                                                    });

        // Convert @Damage to plain text
        // Format is @Damage[(2d6+4)[bludgeoning]]
        // This one has no descriptive text
        const damagePattern = /@Damage\[([^\[\]]+)\[(.*?)\]\]/g;
        markdown = markdown.replace(damagePattern, function(match, p1, p2) {
                                                        let result = doMath(doc, p1);
                                                        if (result) {
                                                            // Remove any wrapping parens
                                                            result = `${result}`.replace(/^\(|\)$/g, "");
                                                        }
                                                        return `${result} ${p2.replace(/,/g, ' ')}`;
                                                    });

        // Convert @Template with no description to plain text
        // Format is @Template[type:cone|distance:30]
        const templatePattern = /@Template\[type:([^\|]+)\|distance:(\d+)\]/g;
        markdown = markdown.replace(templatePattern, function(match, p1, p2) {
                                                        return `${p2}-foot ${p1}`;
                                                    });
     
        // Convert @Check with no description to plain text
        // Format is @Check[type:athletics|dc:15|traits:action:climb]
        //        or @Check\[type:athletics|traits:action:swim|dc:10\]
        //        or @Check\[type:flat|dc:16\]
        // will be converted to "DC 15 Athletics"
        const checkPattern = /@Check\[type:([^\|]+)\|(?:.*?)dc:(\d+)(?:\|.*?)*\]/g;
        markdown = markdown.replace(checkPattern, function(match, p1, p2) {
                                                        p1.charAt(0).toUpperCase() + p1.slice(1);
                                                        return `DC ${p2} ${p1}`;
                                                    });

        // Convert @Check for "basic save" to plain text
        // Format is @Check[type:reflex|dc:resolve(@actor.attributes.spellDC.value)|basic:true]
        // will be converted to "basic Reflex"
        const checkBasicPattern = /@Check\[type:([^\|]+)(?:\|.*?)*(?:\|basic:true)*\]/g;
        markdown = markdown.replace(checkBasicPattern, function(match, p1) {
                                                        p1.charAt(0).toUpperCase() + p1.slice(1);
                                                        return `basic ${p1}`;
                                                    });

        // Convert links BEFORE doing HTML->MARKDOWN (to get links inside tables working properly)
        // The conversion "escapes" the "[[...]]" markers, so we have to remove those markers afterwards
        markdown = turndownService.turndown((await convertLinks(markdown, doc))).replaceAll("\\[\\[","[[").replaceAll("\\]\\]","]]");
        
        // Now convert file references
        const filepattern = /!\[\]\(([^)]*)\)/g;
        markdown = markdown.replaceAll(filepattern, replaceLinkedFile);    
    } catch (error) {
        console.log(error);
        console.warn(`Error: failed to decode html:`, html)
    }

    return markdown;
}

function frontmatter(doc, showheader=true) {
    let header = showheader ? `\n# ${doc.name}\n` : "";
    return FRONTMATTER + 
        `title: "${doc.name}"\n` + 
        `icon: "${DOCUMENT_ICON.lookup(doc)}"\n` +
        `aliases: "${doc.name}"\n` + 
        `foundryId: ${doc.uuid}\n` + 
        `tags:\n  - ${doc.documentName}\n` +
        FRONTMATTER +
        header;
}


async function oneJournal(path, journal) {
    let subpath = path;
    if (journal.pages.size > 1) {
        // Put all the notes in a sub-folder
        subpath = formpath(path, use_uuid_for_journal_folder ? docfilename(journal) : validFilename(journal.name));
        // TOC page 
        // This is a Folder note, so goes INSIDE the folder for this journal entry
        let markdown = frontmatter(journal) + "\n## Table of Contents\n";
        for (let page of journal.pages.contents.sort((a,b) => a.sort - b.sort)) {
            markdown += `\n${' '.repeat(2*(page.title.level-1))}- ${formatLink(docfilename(page), page.name)}`;
        }
        // Filename must match the folder name
        zip.folder(subpath).file(zipfilename(journal), markdown, { binary: false });
    }

    for (const page of journal.pages) {
        let markdown;
        switch (page.type) {
            case "text":
                switch (page.text.format) {
                    case 1: // HTML
                        markdown = await convertHtml(page, page.text.content);
                        break;
                    case 2: // MARKDOWN
                        markdown = page.text.markdown;
                        break;
                }
                break;
            case "image": case "pdf": case "video":
                if (page.src) markdown = fileconvert(page.src) + EOL;
                if (page.image?.caption) markdown += EOL + page.image.caption + EOL;
                break;
        }
        if (markdown) {
            markdown = frontmatter(page, page.title.show) + markdown;
            zip.folder(subpath).file(`${notefilename(page)}.md`, markdown, { binary: false });
        }
    }
}

async function oneRollTable(path, table) {
    let markdown = frontmatter(table);
    
    if (table.description) markdown += table.description + "\n\n";

    markdown += 
        `| ${table.formula || "Roll"} | result |\n` +
        `|------|--------|\n`;

    for (const tableresult of table.results) {
        const range  = (tableresult.range[0] == tableresult.range[1]) ? tableresult.range[0] : `${tableresult.range[0]}-${tableresult.range[1]}`;
        // Escape the "|" in any links
        markdown += `| ${range} | ${(await convertLinks(tableresult.getChatText(), table)).replaceAll("|","\\|")} |\n`;
    }

    // No path for tables
    zip.folder(path).file(zipfilename(table), markdown, { binary: false });
}

function oneScene(path, scene) {

    const sceneBottom = scene.dimensions.sceneRect.bottom;
    const sceneLeft   = scene.dimensions.sceneRect.left;
    const units_per_pixel = /*units*/ scene.grid.distance / /*pixels*/ scene.grid.size;

    function coord(pixels) {
        return pixels * units_per_pixel;
    }
    function coord2(pixely, pixelx) { return `${coord(sceneBottom - pixely)}, ${coord(pixelx - sceneLeft)}` };

    let markdown = frontmatter(scene);

    // Two "image:" lines just appear as separate layers in leaflet.
    let overlays=[]
    if (scene.foreground) {
        overlays.push(`${fileconvert(scene.foreground, "Foreground", /*inline*/false)}`);
    }

    for (const tile of scene.tiles) {
        // tile.overhead
        // tile.roof
        // tile.hidden
        // tile.z
        // tile.alpha
        // - [ [[ImageFile2|Optional Alias]], [Top Left Coordinates], [Bottom Right Coordinates] ]
        let name = tile.texture.src;
        let pos = name.lastIndexOf('/');
        if (pos) name = name.slice(pos+1);
        overlays.push(`${fileconvert(tile.texture.src, name, /*inline*/ false)}, [${coord2(tile.y+tile.height-1, tile.x)}], [${coord2(tile.y, tile.x+tile.width-1)}]`);
    }

    let layers = (overlays.length === 0) ? "" : 'imageOverlay:\n' + overlays.map(layer => `    - [ ${layer} ]\n`).join("");
    // scene.navName - maybe an alias in the frontmatter (if non-empty, and different from scene.name)
    markdown += 
        `\n${MARKER}leaflet\n` +
        `id: ${scene.uuid}\n` +
        `bounds:\n    - [0, 0]\n    - [${coord(scene.dimensions.sceneRect.height)}, ${coord(scene.dimensions.sceneRect.width)}]\n` +
        "defaultZoom: 2\n" +
        `lat: ${coord(scene.dimensions.sceneRect.height/2)}\n` +
        `long: ${coord(scene.dimensions.sceneRect.width/2)}\n` +
        `height: 100%\n` +
        `draw: false\n` +
        `unit: ${scene.grid.units}\n` +
        `showAllMarkers: true\n` +
        `preserveAspect: true\n` +
        `image: ${fileconvert(scene.background.src, null, /*inline*/false)}\n` +
        layers;

    // scene.dimensions.distance / distancePixels / height / maxR / ratio
    // scene.dimensions.rect: (x, y, width, height, type:1)
    // scene.dimensions.sceneHeight/sceneWidth/size/height/width
    // scene.grid: { alpha: 0.2, color: "#000000", distance: 5, size: 150, type: 1, units: "ft"}
    // scene.height/width

    for (const note of scene.notes) {
        const linkdoc = note.page || note.entry;
        const linkfile = linkdoc ? notefilename(linkdoc) : "Not Linked";
        // Leaflet plugin doesn't like ":" appearsing in the Note's label.
        const label = note.label.replaceAll(":","_");

        // invert Y coordinate, and remove the padding from the note's X,Y position
        markdown += `marker: default, ${coord2(note.y, note.x)}, ${formatLink(linkfile, label)}\n`;
            //`    icon: :${note.texture.src}:` + EOL +
    }
    markdown += MARKER;

    // scene.lights?

    zip.folder(path).file(zipfilename(scene), markdown, { binary: false });
}

function onePlaylist(path, playlist) {
    // playlist.description
    // playlist.fade
    // playlist.mode
    // playlist.name
    // playlist.seed
    // playlist._playbackOrder (array, containing list of keys into playlist.sounds)
    // playlist.sounds (collection of PlaylistSound)
    //    - debounceVolume
    //    - description
    //    - fade
    //    - name
    //    - path (filename)
    //    - pausedTime
    //    - repeat (bool)
    //    - volume

    let markdown = frontmatter(playlist);

    if (playlist.description) markdown += playlist.description + EOL + EOL;

    for (const id of playlist._playbackOrder) {
        const sound = playlist.sounds.get(id);
        // HOW to encode volume of each track?
        markdown += `#### ${sound.name}` + EOL;
        if (sound.description) markdown += sound.description + EOL
        markdown += fileconvert(sound.path) + EOL;
    }

    zip.folder(path).file(zipfilename(playlist), markdown, { binary: false });
}

async function documentToJSON(path, doc) {
    // see Foundry exportToJSON

    const data = doc.toCompendium(null);
    // Remove things the user is unlikely to need
    if (data.prototypeToken) delete data.prototypeToken;

    let markdown = frontmatter(doc);
    if (doc.img) markdown += fileconvert(doc.img, IMG_SIZE) + EOL + EOL;

    // Some common locations for descriptions
    const DESCRIPTIONS = [
        "system.details.biography.value",  // Actor: DND5E
        "system.details.publicNotes",       // Actor: PF2E
        "system.description.value",        // Item: DND5E and PF2E
    ]
    for (const field of DESCRIPTIONS) {
        let text = foundry.utils.getProperty(doc, field);
        if (text) markdown += await convertHtml(doc, text) + EOL + EOL;
    }

    let datastring;
    let dumpoption = game.settings.get(MOD_CONFIG.MODULE_NAME, MOD_CONFIG.OPTION_DUMP);
    if (dumpoption === "YAML")
        datastring = jsyaml.dump(data);
    else if (dumpoption === "JSON")
        datastring = JSON.stringify(data, null, 2) + EOL;
    else
        console.error(`Unknown option for dumping objects: ${dumpoption}`)
    // TODO: maybe extract Items as separate notes?

    // Convert LINKS: Foundry syntax to Markdown syntax
    datastring = await convertLinks(datastring, doc);

    markdown +=
        MARKER + doc.documentName + EOL + 
        datastring +
        MARKER + EOL;

    zip.folder(path).file(zipfilename(doc), markdown, { binary: false });
}

async function maybeTemplate(path, doc) {
    const templatePath = templateFile(doc);
    if (!templatePath) return documentToJSON(path, doc);
    console.log(`Using handlebars template '${templatePath}' for '${doc.name}'`)

    // Always upload the IMG, if present, but we won't include the corresponding markdown
    if (doc.img) {
        fileconvert(doc.img, IMG_SIZE);
        // Convert the image path to what is being saved.
        // NOTE: please observe any license restrictions on images from
        //       journal entries you do not directly own.  
        //       See: data/systems/pf2e/licenses for PF2e artwork license information.
        doc.img = doc.img.replaceAll("/","-").slice(-250 + destForImages.length); 
    }

    // Some common locations for descriptions
    const DESCRIPTIONS = [
        "system.details.biography.value",  // Actor: DND5E
        "system.details.publicNotes",       // Actor: PF2E
        "system.description.value",        // Item: DND5E and PF2E
    ]

    // Convert a few known HTML formatted entries into Markdown
    // so they can easily be used in a Handlebar without needing further processing.
    for (const field of DESCRIPTIONS) {
        let text = foundry.utils.getProperty(doc, field);
        if (text) {
            text = await convertHtml(doc, text);
            foundry.utils.setProperty(doc, field, text)
        }
    }
    
    // Apply the supplied template file:
    // Foundry renderTemplate only supports templates with file extensions: html, handlebars, hbs
    // Foundry filePicker hides all files with extension html, handlebars, hbs
    const markdown = await myRenderTemplate(templatePath, doc).catch(err => {
        ui.notifications.warn(`Handlers Error: ${err.message}`);
        throw err;
    })

    zip.folder(path).file(zipfilename(doc), markdown, { binary: false });
}

async function oneDocument(path, doc) {
    if (doc instanceof JournalEntry)
        await oneJournal(path, doc);
    else if (doc instanceof RollTable)
        await oneRollTable(path, doc);
    else if (doc instanceof Scene && game.settings.get(MOD_CONFIG.MODULE_NAME, MOD_CONFIG.OPTION_LEAFLET))
        await oneScene(path, doc);
    else if (doc instanceof Playlist)
        await onePlaylist(path, doc);
    else
        await maybeTemplate(path, doc);
    // Actor
    // Cards
    // ChatMessage
    // Combat(Tracker)
    // Item
    // Macro
}

async function oneChatMessage(path, message) {
    let html = await message.getHTML();
    if (!html?.length) return message.export();

    return `## ${new Date(message.timestamp).toLocaleString()}\n\n` + 
        await convertHtml(message, html[0].outerHTML);
}

async function oneChatLog(path, chatlog) {
    // game.messages.export:
    // Messages.export()
    let log=""
    for (const message of chatlog.collection) {
        log += await oneChatMessage(path, message) + "\n\n---------------------------\n\n";
    }
    //const log = chatlog.collection.map(m => oneChatMessage(path, m)).join("\n---------------------------\n");
    let date = new Date().toDateString().replace(/\s/g, "-");
    const filename = `log-${date}.md`;

    zip.folder(path).file(filename, log, { binary: false });
}

async function oneFolder(path, folder) {
    let subpath = formpath(path, validFilename(folder.name));
    for (const journal of folder.contents) {
        await oneDocument(subpath, journal);
    }
    for (const childfolder of folder.getSubfolders(/*recursive*/false)) {
        await oneFolder(subpath, childfolder);
    }
}

async function onePack(path, pack) {
    let type = pack.metadata.type;
    console.debug(`Collecting pack '${pack.title}'`)
    let subpath = formpath(path, validFilename(pack.title));
    const documents = await pack.getDocuments();
    for (const doc of documents) {
        await oneDocument(subpath, doc);
    }
}

async function onePackFolder(path, folder) {
    let subpath = formpath(path, validFilename(folder.name));
    for (const pack of game.packs.filter(pack => pack.folder === folder)) {
        await onePack(subpath, pack);
    }
}

let is_v10=false

export async function exportMarkdown(from, zipname) {

    clearTemplateCache();

    use_uuid_for_journal_folder = game.settings.get(MOD_CONFIG.MODULE_NAME, MOD_CONFIG.OPTION_FOLDER_AS_UUID);
    use_uuid_for_notename       = game.settings.get(MOD_CONFIG.MODULE_NAME, MOD_CONFIG.OPTION_NOTENAME_IS_UUID);

    let noteid = ui.notifications.info(`${MODULE_NAME}.ProgressNotification`, {permanent: true, localize: true})
    // Wait for the notification to get drawn
    await new Promise(resolve => setTimeout(resolve, 100));

    zip = new JSZip();

    const TOP_PATH = "";

    if (from instanceof Folder) {
        console.debug(`Processing one Folder`)
        // Do we put in the full hierarchy that might be ABOVE the indicated folder
        if (from.type === "Compendium")
            await onePackFolder(TOP_PATH, from);
        else
            await oneFolder(TOP_PATH, from);
    }
    else if (is_v10 ? from instanceof SidebarDirectory : from instanceof DocumentDirectory) {
        for (const doc of from.documents) {
            await oneDocument(folderpath(doc), doc);
        }
    } else if (from instanceof CompendiumDirectory) {
        // from.collection does not exist in V10
        for (const doc of game.packs) {
            await onePack(folderpath(doc), doc);
        }
    } else if (from instanceof CompendiumCollection) {
        await onePack(TOP_PATH, from);
    } else if (from instanceof CombatTracker) {
        for (const combat of from.combats) {
            await oneDocument(TOP_PATH, combat);
        }
    }
    else if (from instanceof ChatLog) {
        await oneChatLog(from.title, from);
    } else
        await oneDocument(TOP_PATH, from);

    let blob = await zip.generateAsync({ type: "blob" });
    await saveDataToFile(blob, `${validFilename(zipname)}.zip`);
    // ui.notifications.remove does not exist in Foundry V10
    ui.notifications.remove?.(noteid);
}

function ziprawfilename(name, type) {
    if (!type) return name;
    return `${type}-${name}`;
}

Hooks.once('init', async () => {
    // Foundry V10 doesn't use DocumentDirectory
    is_v10 = (typeof DocumentDirectory === "undefined");

    // If not done during "init" hook, then the journal entry context menu doesn't work

    const baseClass = is_v10 ? "SidebarDirectory" : "DocumentDirectory";

    // JOURNAL ENTRY context menu
    function addEntryMenu(wrapped, ...args) {
        return wrapped(...args).concat({
            name: `${MODULE_NAME}.exportToMarkdown`,
            icon: '<i class="fas fa-file-zip"></i>',
            condition: () => game.user.isGM,
            callback: async header => {
                const li = header.closest(".directory-item");
                const id = li.data(is_v10 ? "documentId" : "entryId");
                const entry = this.documents.find(d => d.id === id);
                //const entry = this.collection.get(li.data("entryId")); // works only on V11+
                if (entry) exportMarkdown(entry, ziprawfilename(entry.name, entry.constructor.name));
            },
        });
    }
    libWrapper.register(MODULE_NAME, `${baseClass}.prototype._getEntryContextOptions`, addEntryMenu, libWrapper.WRAPPER);

    function addCompendiumEntryMenu(wrapped, ...args) {
        return wrapped(...args).concat({
            name: `${MODULE_NAME}.exportToMarkdown`,
            icon: '<i class="fas fa-file-zip"></i>',
            condition: li => game.user.isGM,
            callback: async li => {
                const pack = game.packs.get(li.data("pack"));
                if (pack) exportMarkdown(pack, ziprawfilename(pack.title, pack.metadata.type));
            },
        });
    }
    libWrapper.register(MODULE_NAME, "CompendiumDirectory.prototype._getEntryContextOptions", addCompendiumEntryMenu, libWrapper.WRAPPER);

    // FOLDER context menu: needs 
    function addFolderMenu(wrapped, ...args) {
        return wrapped(...args).concat({
            name: `${MODULE_NAME}.exportToMarkdown`,
            icon: '<i class="fas fa-file-zip"></i>',
            condition: () => game.user.isGM,
            callback: async header => {
                const li = header.closest(".directory-item")[0];
                // li.dataset.uuid does not exist in Foundry V10
                const folder = await fromUuid(`Folder.${li.dataset.folderId}`);
                if (folder) exportMarkdown(folder, ziprawfilename(folder.name, folder.type));
            },
        });
    }
    libWrapper.register(MODULE_NAME, `${baseClass}.prototype._getFolderContextOptions`, addFolderMenu, libWrapper.WRAPPER);
    if (!is_v10) libWrapper.register(MODULE_NAME, "CompendiumDirectory.prototype._getFolderContextOptions", addFolderMenu, libWrapper.WRAPPER);
})

Hooks.on("renderSidebarTab", async (app, html) => {
    if (!game.user.isGM) return;

    if (!(app instanceof Settings)) {
        const label = game.i18n.localize(`${MODULE_NAME}.exportToMarkdown`);
        const help  = game.i18n.localize(`${MODULE_NAME}.exportToMarkdownTooltip`);
        let button = $(`<button style="flex: 0" title="${help}"><i class='fas fa-file-zip'></i>${label}</button>`)
        button.click((event) => {
            event.preventDefault();
            exportMarkdown(app, ziprawfilename(app.constructor.name));
        });

        html.append(button);
    } else {
        console.debug(`Export-Markdown | Not adding button to sidebar`, app)
    }
})
