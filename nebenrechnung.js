/** Add a new calculation line **/
function add_calc_line() {
	const nr_line = document.createElement('nr-line');
	nr_line.setAttribute('contenteditable', 'true'); 
	const nr_sum = document.createElement('nr-sum');
	const nr_sheet = document.getElementById('sheet');
	console.log(nr_sheet);
	nr_sheet.appendChild(nr_line); 
	nr_sheet.appendChild(nr_sum); 
}

class Nebenrechnung {
	total; 
	subtotal;

	constructor() {
		this.#get_sheet();
	}

	#get_sheet() {
		const sheet = document.querySelector('nr-sheet');

		Array.from(sheet.children).forEach((child, index) => {
			console.log(`Element ${index + 1}:`, child.tagName, child.textContent.trim());
			if (child.tagName == 'NR-LINE') {
				this.#read_line(child); 
			} else if (child.tagName == 'NR-SUM') {
				console.log(child);
				this.#to_sum(child, index);
			}

	    });
	}

	#read_line(tag) {
		// const line = tag.textContent; 
		// this.#calcon(line);
		// console.log(line);
		const words = tag.textContent.split(' ');
		words.forEach(function(item) {
			console.log(item);
		})
	}

	#to_sum(tag, value) {
		tag.textContent = `New ${value + 1}`; 
		console.log(`to_sum: ${value + 1}`);
	}

	#calcon(line) {
		const words = line.split(' ');
		words.forEach(function(item) {
			console.log(item);
		})
	}

}

window.onload = function () {
	const nr = new Nebenrechnung(); 
}
