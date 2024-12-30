/** Add a new calculation line **/
function add_calc_line() {
	const nr_line = document.createElement('nr-line');
	nr_line.setAttribute('contenteditable', 'true'); 
	const nr_sum = document.createElement('nr-sum');
	const nr_sheet = document.getElementById('sheet');
	// console.log(nr_sheet);
	nr_sheet.appendChild(nr_line); 
	nr_sheet.appendChild(nr_sum); 
}

class Nebenrechnung {
	total; 
	subtotal;

	constructor() {
		this.#get_sheet();
		this.#key_listener(); 
	}

	#key_listener() {
		// console.log('key_listener');
		document.body.addEventListener('keyup', this.#keyups.bind(this));
	}

	#keyups(e) {
		// console.log(e.code);
		this.#get_sheet();
	}

	#get_sheet() {
		const sheet = document.querySelector('nr-sheet');

		this.total = 0;
		Array.from(sheet.children).forEach((child, index) => {
			// console.log(`Element ${index + 1}:`, child.tagName, child.textContent.trim());
			if (child.tagName == 'NR-LINE') {
				this.#read_line(child); 
			} else if (child.tagName == 'NR-SUM') {
				// console.log(child);
				this.#to_sum(child, index);
			}

	    });

		const tag_total = document.getElementById('total');
		tag_total.textContent = this.total;
	}

	#read_line(tag) {
		this.subtotal = 0;
		const calc = new Array();

		const words = tag.textContent.split(' ');
		words.forEach(function(item) {
			let is_float = parseFloat(item);
			
			if (!isNaN(is_float)) {
				calc.push(is_float);
			} else if( item.length == 1 && item.match( /([-()+*/%])/ )) { 
				calc.push(item);
			} else {
				console.log(`ELSE: ${item}`);
			}
		})
		console.log(calc);
		this.subtotal = eval(calc.join(''));
		console.log(this.subtotal);
		this.total += this.subtotal; 
		console.log(this.total);
	}

	#to_sum(tag, value) {
		tag.textContent = this.subtotal; 
		// console.log(`to_sum: ${value + 1}`);
	}

}

window.onload = function () {
	const nr = new Nebenrechnung(); 
}
